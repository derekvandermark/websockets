import { ReadyState } from "./types";

export const STATE: {[index: string]: ReadyState} = {
    CONNECTING: 'CONNECTING',
    OPEN: 'OPEN',
    CLOSING: 'CLOSING',
    CLOSED: 'CLOSED'
};

// RFC 6455 Section 4.2.2 list item #5 sub-list item #4
// This GUID (Globally Unique Identifier) is used as a because it is: 
// "unlikely to be used by network endpoints that do not understand the WebSocket Protocol".
// This is used in creating the 'Sec-WebSocket-Accept' header value to indicate acceptance of the connection
export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';