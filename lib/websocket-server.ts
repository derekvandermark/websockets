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
    #subProtocols: string[] | undefined;

    // server & metadata
    #server: Server | null;
    #serviceRoute: Pathname;
    #wildcardRoute: boolean;
    //#activeConnections: ConnectionList;

    constructor(server: Server | null, route: Pathname, options?: WSSOptions) { 
        super();

        const optionValues = {
            origins: undefined,
            requireOrigin: false,
            subProtocols: undefined,
            ...options
        };

        // options
        this.#origins = optionValues.origins;
        this.#requireOrigin = optionValues.requireOrigin;
        this.#subProtocols = optionValues.subProtocols;

        // server & metadata
        this.#server = server;
        this.#serviceRoute = route;
        this.#wildcardRoute = this.#isWildcard(route);
        
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

    // don't forget binding socket (data events no longer emitted)
    #upgrade(req: ValidRequest, socket: TLSSocket): void {
        const headers: string[] = [
            'Upgrade: websocket', 
            'Connection: Upgrade'
        ];

        // add the 'Sec-WebSocket-Accept' value to the header
        const acceptValue = this.#generateSecWebSocketAccept(req.headers["sec-websocket-key"]);
        headers.push(`Sec-WebSocket-Accept: ${acceptValue}`);

        // negotiate protocol 

        // RFC 6455 specifies that the client can list multiple protocols in order of preference, 
        // but the IncomingMessage object only has one potential protocol, and is handled as such.

        const requestedProtocol = req.headers["sec-websocket-protocol"];
        if (requestedProtocol && this.#subProtocols?.includes(requestedProtocol)) {
            headers.push(`Sec-WebSocket-Protocol: ${requestedProtocol}`);
        }
        
        // 101 Switching Protocols
        const res = formatHttpResponse(101, headers);
        socket.write(res, 'utf-8');

        // emit the connection event and pass the newly created WebSocket to the callback
        const url = new URL(req.url, `https://${req.headers.host}`);
        const ws = new WebSocket(socket, url.pathname); 
        this.emit('connection', ws);
    }

    #abort(statusCode: number, socket: TLSSocket, headers?: string[]): void {
        const res = formatHttpResponse(statusCode, headers);
        socket.write(res, 'utf-8');
        socket.end();
    }

    #versionValid(req: IncomingMessage): boolean {
        return req.headers["sec-websocket-version"] === '13';
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

    #requestValid(req: IncomingMessage): req is ValidRequest {
        if (Number(req.httpVersion) < 1.1) return false;

        if (req.method !== 'GET') return false;

        if (!req.url) return false;
        
        //if (req.headers.host !== Server's Authority) return true;

        if (req.headers.upgrade !== 'websocket') return false;

        if (req.headers.connection !== 'upgrade') return false;

        const key = req.headers["sec-websocket-key"];
        if (!key || !this.#keyValid(key)) return false;

        return true;
    }

    #keyValid(key: string): boolean {
        // must be base64 encoded
        if (!isBase64Encoded(key)) return false;

        // must be 16 bytes when decoded
        if (key.length !== 24) return false;
        if (key.substring(22) !== '==') return false;

        return true;
    }

    #generateSecWebSocketAccept(key: string): string {
        const concatenated = key.concat(GUID);
    
        const hash = crypto.createHash('sha1');
        hash.update(concatenated, 'base64');
        const buffer = hash.digest();
    
        return buffer.toString('base64');
    }

    // the ':' prefix to a path segment indicates a wildcard route
    #isWildcard(route: Pathname): boolean {
        // find index of last '/' character; the next character must be ':' for true
        const i = lastSlash(route);
        return route[i + 1] === ':';
    }

    #correctRoute(req: IncomingMessage): boolean {
        if (!req.url) return false;
        
        const url = new URL(req.url, `https://${req.headers.host}`);
        const pathname = url.pathname;

        // j = 1, i = 1 to skip '/' prefix
        let j = 1;
        let skipToNextSegment = false;
        const slashIndex = lastSlash(this.#serviceRoute);
        for (let i = 1; i < pathname.length; i++) {
        
            // increment indexes to next '/' in each string
            while (skipToNextSegment) {
                if (pathname[i] === '/' && this.#serviceRoute[j] === '/') {
                    skipToNextSegment = false;
                    continue;
                } 

                if (pathname[i] === '/' && this.#serviceRoute[j] !== '/') {
                    j++;
                }

                if (pathname[i] !== '/' && this.#serviceRoute[j] === '/') {
                    i++;
                }

                if (pathname[i] !== '/' && this.#serviceRoute[j] !== '/') {
                    i++;
                    j++;
                }
            }

            // skip any wildcards
            if (this.#serviceRoute[j] === ':' && (j - 1) !== slashIndex) {
                skipToNextSegment = true;
                continue;
            }

            // if we've reached the final wildcard segment, the route is valid
            if (this.#serviceRoute[j] === ':') {
                return true;
            }

            // if non-wildcard path segments are not identical, the route is invalid
            if (pathname[i] !== this.#serviceRoute[j]) {
                return false;
            }

            j++;
        }

        return true;
    }

}