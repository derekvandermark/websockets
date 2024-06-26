import EventEmitter from "events";
import { TLSSocket } from "tls";
import { STATE } from "./constants";
import { Pathname, ReadyState } from "./types";

export default class WebSocket extends EventEmitter {

    #tlsSocket: TLSSocket;
    readyState: ReadyState;
    uri: Pathname;
    // uri: the uri this websocket requested, so we know what purpose this websocket serves
    // and can call the getter for all websockets connected which requested this URI initially
    
    constructor(tlsSocket: TLSSocket, pathname: Pathname) {
        super();
        this.#tlsSocket = tlsSocket;
        this.readyState = STATE.OPEN;
        this.uri = pathname;
    }

} 