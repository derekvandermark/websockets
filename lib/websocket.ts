import { EventEmitter } from "stream";
import { TLSSocket } from "tls";
import { STATE } from "./constants";
import { ReadyState } from "./types";

export default class WebSocket extends EventEmitter {

    constructor(tlsSocket: TLSSocket) {
        super();
        this.tlsSocket = tlsSocket;
        this.readyState = STATE.CONNECTING;
    }

    tlsSocket: TLSSocket;
    readyState: ReadyState;

} 