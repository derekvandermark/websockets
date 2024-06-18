import EventEmitter from "events";
import https from 'https';
import http from 'http';
import WebSocket from "./websocket";
import { ConnectionListener, Credentials, Pathname, WSSOptions } from "./types";
import { TLSSocket, Server } from "tls";
import { IncomingMessage } from "http";
import { Duplex } from "stream";
import { formatHttpResponse, generateSecWebSocketAccept, isBase64Encoded } from "./util";

const hostname = '127.0.0.1';
const port = 3000;

export default class WebSocketServer extends EventEmitter {

    server: Server;
    #serviceRoute: Pathname;
    #wildcardRoute: boolean;
    #origins: string[];
    #requireOrigin: boolean;
    #subProtocols: string[];
    //activeConnections

    constructor(server: Server, route: Pathname, options?: WSSOptions) { 
        super();
        
        this.server = server;
        this.#serviceRoute = route;
        // this.#wildcardRoute = this.isWildcard(route);
        this.#origins = options.origins;
        this.#requireOrigin = options.requireOrigin;
        this.#subProtocols = options.subProtocols;

        // Start server and attach main event listeners
        this.server.listen(port, hostname, () => {
            console.log(`WebSocket server running at https://${hostname}:${port}`);
        });

        this.server.on('upgrade', (req, socket, head) => { 
            console.log("in upgrade");
            const url = new URL(req.url, `https://${req.headers.host}`);
            if (url.pathname === route) {
                this.handleUpgrade(req, socket, head);
            }
        });

    }

    handleUpgrade(req: IncomingMessage, socket: TLSSocket, head: Buffer): void {
        if (this.routeInvalid(req)) {
            this.abort(404, socket);
        } else if (this.originInvalid(req)) {
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

        // add the 'Sec-WebSocket-Accept' value to the headers
       const acceptValue = generateSecWebSocketAccept(req.headers["sec-websocket-key"]);
       headers.push(`Sec-WebSocket-Accept: ${acceptValue}`);

        
        // 101 Switching Protocols
        const res = formatHttpResponse(101, headers);
        socket.write(res, 'utf-8');
    }

    abort(statusCode: number, socket: TLSSocket, headers?: string[]): void {
        const res = formatHttpResponse(statusCode, headers);
        socket.write(res, 'utf-8');
        socket.end();
    }

    routeInvalid(req: IncomingMessage): boolean {
        const url = new URL(req.url, `https://${req.headers.host}`);
        return this.#serviceRoute !== url.pathname;
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

    // isWildcard(route: Pathname): boolean {
 
    // }

}