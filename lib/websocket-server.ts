import EventEmitter from "events";
import https, { Server } from 'https';
import WebSocket from "./websocket";
import { ConnectionListener, Credentials } from "./types";
import { TLSSocket } from "tls";
import { IncomingMessage } from "http";
import { Duplex } from "stream";

const hostname = '127.0.0.1';
const port = 3000;

export default class WebSocketServer extends EventEmitter {

    server: Server;
    #serviceRoutes: string[];
    //activeConnections

    constructor(credentials: Credentials, routes: string[], connectionListener?: ConnectionListener) { 
        super();
        
        this.#serviceRoutes = routes;
        this.server = https.createServer(credentials);

        // Attach main event listeners
        this.server.listen(port, hostname, () => {
            console.log("WebSocket server running...");
        });

        this.server.on('upgrade', (req, socket, head) => { // this
            this.handleUpgrade(req, socket, head);
        });

        this.server.on('request', (req, res) => {
            this.emit('request', req, res);
        });
    }

    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
        if (!this.routeValid(req)) {
            
        } 
    }

    routeValid(req: IncomingMessage): boolean {
        const url = new URL(req.url, `https://${req.headers.host}`);
        return this.#serviceRoutes.includes(url.pathname);
    }

    abort() {

    }

}