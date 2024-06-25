import http from 'http';
import { Pathname } from './types';

export function formatHttpResponse(statusCode: number, headers?: string[]): string {
    const statusText = http.STATUS_CODES[statusCode];
    const date = new Date().toUTCString();

    const formattedResponse = 
    `HTTPS/1.1 ${statusCode} ${statusText}\r\n
    Date: ${date}\r\n
    ${headers?.forEach((header) => `${header}\r\n`)}
    \r\n`;

    return formattedResponse;
}

export function isBase64Encoded(str: string): boolean {
    const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    return base64Regex.test(str);
}

// returns the index of the last forward slash in a string
export function lastSlash(str: Pathname): number {
    for (let i = str.length; i >= 0; i--) {
        if (str[i] === '/') {
            return i;
        }
    }

    // should never reach here since arg must be type Pathname; default case is a '/' at index 0
    return 0;
}