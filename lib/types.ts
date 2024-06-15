import { TLSSocket } from "tls";

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
    subProtocol?: string
}
