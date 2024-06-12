import EventEmitter from "events";
import https from 'https';
import http from 'http';
import WebSocket from "./websocket";
import { ConnectionListener, Credentials, Pathname } from "./types";
import { TLSSocket, Server } from "tls";
import { IncomingMessage } from "http";
import { Duplex } from "stream";

const hostname = '127.0.0.1';
const port = 3000;

export default class WebSocketServer extends EventEmitter {

    server: Server;
    #serviceRoute: Pathname;
    #wildcardRoute: boolean;
    #subProtocol: string;
    //activeConnections

    constructor(server: Server, route: Pathname, subProtocol?: string) { 
        super();
        
        this.server = server;
        this.#serviceRoute = route;
        // this.#wildcardRoute = this.isWildcard(route);
        this.#subProtocol = subProtocol;

        // Start server and attach main event listeners
        this.server.listen(port, hostname, () => {
            console.log("WebSocket server running...");
        });

        this.server.on('upgrade', (req, socket, head) => { 
            this.handleUpgrade(req, socket, head);
        });

        this.server.on('request', (req, res) => {
            this.emit('request', req, res);
        });
    }

    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  
    }

    routeValid(req: IncomingMessage): boolean {
        const url = new URL(req.url, `https://${req.headers.host}`);
        return this.#serviceRoute === url.pathname;
    }

    abortUpgrade(statusCode: number, socket: Duplex): void {
        const res = formatHttpResponse(statusCode);
        socket.end(res, 'utf-8');
    }

    // isWildcard(route: Pathname): boolean {
 
    // }

}

function formatHttpResponse(statusCode: number): string {
    const status = http.STATUS_CODES[statusCode];
    const formattedResponse = 
    `HTTPS/1.1 ${statusCode} ${status}\r\n
    \r\n`;

    return formattedResponse;
}