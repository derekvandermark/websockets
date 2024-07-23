import EventEmitter from "events";
import crypto from 'crypto';
import WebSocket from "./websocket";
import { TLSSocket, Server } from "tls";
import { IncomingMessage } from "http";
import { GUID } from './constants';
import { 
    ConnectionList, 
    ValidRequest,
    Pathname, 
    WSSOptions 
} from "./types";
import { 
    formatHttpResponse, 
    isBase64Encoded, 
    lastSlash 
} from "./util";

const hostname = '127.0.0.1';
const port = 3000;

export default class WebSocketServer extends EventEmitter {

    // options
    #origins: string[] | undefined;
    #requireOrigin: boolean;
    #subprotocols: string[] | undefined;

    // server & metadata
    #server: Server | null;
    #serviceRoute: Pathname;
    #wildcardRoute: boolean;
    #activeConnections: ConnectionList;

    constructor(server: Server | null, route: Pathname, options?: WSSOptions) { 
        super();

        const optionValues = {
            origins: undefined,
            requireOrigin: false,
            subprotocols: undefined,
            ...options
        };

        // options
        this.#origins = optionValues.origins;
        this.#requireOrigin = optionValues.requireOrigin;
        this.#subprotocols = optionValues.subprotocols;

        // server & metadata
        this.#server = server;
        this.#serviceRoute = route;
        this.#wildcardRoute = this.#isWildcard(route);
        this.#activeConnections = this.#wildcardRoute ? {} : [];
        
        if (this.#server) {
            // Start server and attach main event listeners
            this.#server.listen(port, hostname, () => {
                console.log(`WebSocket server running at https://${hostname}:${port}`);
            });

            this.#server.on('upgrade', (req, socket, head) => { 
                if (this.#correctRoute(req)) {
                    this.handleUpgrade(req, socket, head);
                } else {
                    this.#abort(404, socket);
                }
            });
        }
    }

    // if activeConnections is an array, return it, as there is a single endpoint
    // if a uri is provided, get all WebSockets at that specific uri, as there are multiple possible endpoints
    getPeers(uri?: string): WebSocket[] {
        if (Array.isArray(this.#activeConnections)) {
            return this.#activeConnections;
        } else if (uri) {
            return this.#activeConnections[uri];
        } else {
            throw('Error: getPeers() expects a URI argument for a WebSocketServer of a wildcard route.');
        }
    }

    handleUpgrade(req: IncomingMessage, socket: TLSSocket, head: Buffer): void {
        if (!this.#originValid(req)) {
            this.#abort(403, socket);
        } else if (!this.#requestValid(req)) {
            this.#abort(400, socket);
        } else if (!this.#versionValid(req)) {
            this.#abort(426, socket, ['Sec-Websocket-Version: 13']);
        } else {
            this.#upgrade(req, socket);
        }
    }

    #abort(statusCode: number, socket: TLSSocket, headers?: string[]): void {
        const res = formatHttpResponse(statusCode, headers);
        socket.write(res, 'utf-8');
        socket.end();
    }

    // don't forget binding socket (data events no longer emitted)
    #upgrade(req: ValidRequest, socket: TLSSocket): void {
        // Create new WebSocket
        const url = new URL(req.url, `https://${req.headers.host}`);
        const ws = new WebSocket(socket, url.pathname as Pathname); 

        // Keep track of connection and emit the connection event
        this.#addConnection(ws);
        this.emit('connection', ws);

        // Send response handshake (101 Switching Protocols)
        const headers = this.#generateHeaders(req);
        const res = formatHttpResponse(101, headers);
        socket.write(res, 'utf-8');
    }

    #addConnection(ws: WebSocket): void {
        if (Array.isArray(this.#activeConnections)) {
            // all WebSockets are connected to the same endpoint
            this.#activeConnections.push(ws);
        } else {
            // the WebSocket should be in an array with those connected to the same wildcard endpoint
            const wildcardStartIndex = lastSlash(ws.uri) + 1;
            const wildcardEndpoint = ws.uri.substring(wildcardStartIndex);
            this.#activeConnections[wildcardEndpoint].push(ws);
        }
    }

    #generateHeaders(req: ValidRequest): string[] {
        // constant headers
        const headers: string[] = [
            'Upgrade: websocket', 
            'Connection: Upgrade'
        ];

        // add the 'Sec-WebSocket-Accept' value to the headers
        const acceptValue = this.#generateSecWebSocketAccept(req.headers["sec-websocket-key"]);
        headers.push(`Sec-WebSocket-Accept: ${acceptValue}`);

        // negotiate subprotocol 
        const protocols = req.headers["sec-websocket-protocol"];
        if (protocols) {
            const selectedProtocol = this.#selectProtocol(protocols);
            if (selectedProtocol) {
                headers.push(`Sec-WebSocket-Protocol: ${selectedProtocol}`);
            }
        }

        return headers;
    }

    /* 
     * Spec [ALGORITHM]
     * Sec-WebSocket-Accept
     * RFC 6455 Section 4.2.2, bullet 5, sub-bullet 4 
     */
    #generateSecWebSocketAccept(key: string): string {
        const trimmed = key.trim();                       // remove any leading/trailing whitespace
        const concatenated = trimmed.concat(GUID);        // concatenate the GUID
    
        const hash = crypto.createHash('sha1');           // create/update/digest hash
        hash.update(concatenated, 'base64');
        const buffer = hash.digest();
    
        return buffer.toString('base64');                 // convert buffer to base64 and return
    }

    /*
     * Spec [VALUE SELECTION]
     * Sec-WebSocket-Protocol
     * RFC 6455 Section 4.2.1 bullet 8
     * 
     * Specifies that the client can list multiple protocols in order of preference, 
     * with the protocols listed from most preferred to least preferred. The server 
     * will select the client's most preferred option out of the supported protocols, 
     * if it exists. 
     */
    #selectProtocol(protocols: string): string | undefined {
        const protocolArray = protocols.split(', ');

        for (let i = 0; i < protocolArray.length; i++) {
            if (this.#subprotocols?.includes(protocolArray[i])) {
                return protocolArray[i];
            }
        }

        return;
    }

    /* 
     * Spec [VALUE]
     * Sec-WebSocket-Version
     * RFC 6455 Section 4.2.1 bullet 6
     */
    #versionValid(req: IncomingMessage): boolean {
        return req.headers["sec-websocket-version"] === '13';
    }

    /* 
     * Spec [GENERAL]
     * Requirements universal to all client handshakes
     * RFC 6455 Section 4.2.1 bullets 1 - 5
     */
    #requestValid(req: IncomingMessage): req is ValidRequest {
        if (Number(req.httpVersion) < 1.1 ||
        req.method !== 'GET' ||
        req.headers.upgrade !== 'websocket' ||
        req.headers.connection !== 'upgrade' ||
        !req.url ||
        !req.headers["sec-websocket-key"] ||
        !this.#keyValid(req.headers["sec-websocket-key"])) {
            return false;
        } 
        //if (req.headers.host !== Server's Authority) return true;
 
        return true;
    }

    /* 
     * Spec [VALUE]
     * Sec-WebSocket-Key 
     * RFC 6455 Section 4.2.1 bullet 5
     */
    #keyValid(key: string): boolean {
        // must be base64 encoded
        if (!isBase64Encoded(key)) return false;

        // must be 16 bytes when decoded
        if (key.length !== 24) return false;
        if (key.substring(22) !== '==') return false;

        return true;
    }

    #originValid(req: IncomingMessage): boolean {
        const reqOrigin = req.headers.origin;

        if (reqOrigin && this.#origins) {
            return this.#origins.includes(reqOrigin);
        }

        // if an origin is required (i.e. client must be a browser), 
        // return false if no origin was found
        if (this.#requireOrigin && !reqOrigin) {
            return false;
        } 
            
        // if no origins are specified, all origins are accepted
        return true;  
    }


    // the ':' prefix to a path segment indicates a wildcard route
    #isWildcard(route: Pathname): boolean {
        // find index of last '/' character; the next character must be ':' for true
        const i = lastSlash(route);
        return route[i + 1] === ':';
    }

    // this is the single wildcard (at the end of the path only) interpretation

    #correctRoute(req: IncomingMessage): boolean {
        if (!req.url) return false;
        
        const url = new URL(req.url, `https://${req.headers.host}`);
        const pathname = url.pathname;

        // j = 1, i = 1 to skip '/' prefix
        let j = 1;
        const slashIndex = lastSlash(this.#serviceRoute);
        for (let i = 1; i < pathname.length; i++) {
            // for a route with a trailing wildcard, break once the last slash is reached,
            // as the route is valid the rest of the way
            if (i === slashIndex && this.#wildcardRoute) {
                break;
            }

            if (pathname[i] !== this.#serviceRoute[j]) {
                return false;
            }
        }

        return true;
    }

    // Below is the multiple wildcard route interpretation

    // #correctRoute(req: IncomingMessage): boolean {
    //     if (!req.url) return false;
        
    //     const url = new URL(req.url, `https://${req.headers.host}`);
    //     const pathname = url.pathname;

    //     // j = 1, i = 1 to skip '/' prefix
    //     let j = 1;
    //     let skipToNextSegment = false;
    //     const slashIndex = lastSlash(this.#serviceRoute);
    //     for (let i = 1; i < pathname.length; i++) {
        
    //         // increment indexes to next '/' in each string
    //         while (skipToNextSegment) {
    //             if (pathname[i] === '/' && this.#serviceRoute[j] === '/') {
    //                 skipToNextSegment = false;
    //                 continue;
    //             } 

    //             if (pathname[i] === '/' && this.#serviceRoute[j] !== '/') {
    //                 j++;
    //             }

    //             if (pathname[i] !== '/' && this.#serviceRoute[j] === '/') {
    //                 i++;
    //             }

    //             if (pathname[i] !== '/' && this.#serviceRoute[j] !== '/') {
    //                 i++;
    //                 j++;
    //             }
    //         }

    //         // skip any wildcards
    //         if (this.#serviceRoute[j] === ':' && (j - 1) !== slashIndex) {
    //             skipToNextSegment = true;
    //             continue;
    //         }

    //         // if we've reached the final wildcard segment, the route is valid
    //         if (this.#serviceRoute[j] === ':') {
    //             return true;
    //         }

    //         // if non-wildcard path segments are not identical, the route is invalid
    //         if (pathname[i] !== this.#serviceRoute[j]) {
    //             return false;
    //         }

    //         j++;
    //     }

    //     return true;
    // }

}