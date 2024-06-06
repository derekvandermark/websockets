import { ReadyState } from "./types";

export const STATE: {[index: string]: ReadyState} = {
    CONNECTING: 'CONNECTING',
    OPEN: 'OPEN',
    CLOSING: 'CLOSING',
    CLOSED: 'CLOSED'
};