import EventEmitter from "events";
import https from 'https';
import http from 'http';
import WebSocket from "./websocket";
import { TLSSocket, Server } from "tls";
import { IncomingMessage } from "http";
import { 
    ConnectionList, 
    ConnectionListener, 
    Credentials, 
    Pathname, 
    WSSOptions 
} from "./types";
import { 
    formatHttpResponse, 
    generateSecWebSocketAccept, 
    isBase64Encoded, 
    lastSlash 
} from "./util";

const hostname = '127.0.0.1';
const port = 3000;

export default class WebSocketServer extends EventEmitter {

    // options
    #noServer: boolean;
    #origins: string[] | null;
    #requireOrigin: boolean;
    #subProtocols: string[] | null;

    // server & metadata
    #server: Server | null;
    #serviceRoute: Pathname;
    #wildcardRoute: boolean;
    #activeConnections: ConnectionList;

    constructor(server: Server | null, route: Pathname, options?: WSSOptions) { 
        super();

        const optionValues: WSSOptions = {
            noServer: false,
            origins: null,
            requireOrigin: false,
            subProtocols: null,
            ...options
        };

        // options
        this.#noServer = optionValues.noServer;
        this.#origins = optionValues.origins;
        this.#requireOrigin = optionValues.requireOrigin;
        this.#subProtocols = optionValues.subProtocols;

        // server & metadata
        this.#server = server;
        this.#serviceRoute = route;
        this.#wildcardRoute = this.isWildcard(route);
        
        if (!this.#noServer) {
            // Start server and attach main event listeners
            this.#server.listen(port, hostname, () => {
                console.log(`WebSocket server running at https://${hostname}:${port}`);
            });

            this.#server.on('upgrade', (req, socket, head) => { 
                if (this.validRoute(req)) {
                    this.handleUpgrade(req, socket, head);
                } else {
                    this.abort(404, socket);
                }
            });
        }
    }

    handleUpgrade(req: IncomingMessage, socket: TLSSocket, head: Buffer): void {
        if (this.originInvalid(req)) {
            this.abort(403, socket);
        } else if (this.badRequest(req)) {
            this.abort(400, socket);
        } else if (this.versionInvalid(req)) {
            this.abort(426, socket, ['Sec-Websocket-Version: 13']);
        } else {
            this.upgrade(req, socket);
        }
    }

    // don't forget binding socket (data events no longer emitted)
    upgrade(req: IncomingMessage, socket: TLSSocket): void {
        const headers: string[] = [
            'Upgrade: websocket', 
            'Connection: Upgrade'
        ];

        // add the 'Sec-WebSocket-Accept' value to the header
        const acceptValue = generateSecWebSocketAccept(req.headers["sec-websocket-key"]);
        headers.push(`Sec-WebSocket-Accept: ${acceptValue}`);

        // negotiate protocol 

        // RFC 6455 specifies that the client can list multiple protocols in order of preference, 
        // but the IncomingMessage object only has one potential protocol, and is handled as such.

        const requestedProtocol = req.headers["sec-websocket-protocol"];
        if (this.#subProtocols?.includes(requestedProtocol)) {
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

    abort(statusCode: number, socket: TLSSocket, headers?: string[]): void {
        const res = formatHttpResponse(statusCode, headers);
        socket.write(res, 'utf-8');
        socket.end();
    }

    versionInvalid(req: IncomingMessage): boolean {
        return req.headers["sec-websocket-version"] !== '13';
    }

    originInvalid(req: IncomingMessage): boolean {
        const reqOrigin = req.headers.origin;

        if (reqOrigin && this.#origins) {
            return !this.#origins.includes(reqOrigin);
        }

        // if an origin is required (i.e. client must be a browser), 
        // return true (i.e. 'invalid') if no origin was found
        if (this.#requireOrigin && !reqOrigin) {
            return true;
        } 
            
        // if no origins are specified, all origins are accepted
        return false;  
    }

    badRequest(req: IncomingMessage): boolean {
        if (Number(req.httpVersion) < 1.1) return true;

        if (req.method !== 'GET') return true;

        if (!req.url) return true;
        
        //if (req.headers.host !== Server's Authority) return true;

        if (req.headers.upgrade !== 'websocket') return true;

        if (req.headers.connection !== 'upgrade') return true;

        if (this.invalidKey(req.headers["sec-websocket-key"])) return true;

        return false;
    }

    invalidKey(key: string): boolean {
        // must be base64 encoded
        if (!isBase64Encoded(key)) return true;

        // must be 16 bytes when decoded
        if (key.length !== 24) return true;
        if (key.substring(22) !== '==') return true;

        return false;
    }

    // the ':' prefix to a path segment indicates a wildcard route
    isWildcard(route: Pathname): boolean {
        // find index of last '/' character; the next character must be ':' for true
        const i = lastSlash(route);
        return route[i + 1] === ':';
    }

    validRoute(req: IncomingMessage): boolean {
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