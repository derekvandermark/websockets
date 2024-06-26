import { TLSSocket } from "tls";
import { IncomingMessage } from "http";
import WebSocket from "./websocket";

export type ReadyState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

export type Credentials = {
    cert: Buffer,
    key: Buffer
}

export type ConnectionListener = (ws: TLSSocket) => void;

export type Pathname = `/${string}`;

export type WSSOptions = {
    origins?: string[],
    requireOrigin?: boolean,
    subProtocols?: string[]
}

/* an array of WebSockets, or in the case of a uri path with a wildcard as the last segment,
 * an object with the keys being the wildcard segments with currently active connections,
 * and the values being the array of active WebSockets at that specific route */
export type ConnectionList = WebSocket[] | { [wildcardId: string]: WebSocket[] };

export type ValidRequest = IncomingMessage & { 
    'url': string, 
    'headers': {
        'sec-websocket-key': string 
    }
};
