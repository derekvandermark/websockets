import http from 'http';
import crypto from 'crypto';
import { GUID } from './constants';

export function formatHttpResponse(statusCode: number, headers?: string[]): string {
    const statusText = http.STATUS_CODES[statusCode];
    const date = new Date().toUTCString();

    const formattedResponse = 
    `HTTPS/1.1 ${statusCode} ${statusText}\r\n
    Date: ${date}\r\n
    ${headers.forEach((header) => `${header}\r\n`)}
    \r\n`;

    return formattedResponse;
}

export function isBase64Encoded(str: string): boolean {
    const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    return base64Regex.test(str);
}

export function generateSecWebSocketAccept(key: string): string {
    const concatenated = key.concat(GUID);

    const hash = crypto.createHash('sha1');
    hash.update(concatenated, 'base64');
    const buffer = hash.digest();

    return buffer.toString('base64');
}

// returns the index of the last forward slash in a string
export function lastSlash(str: string): number {
    for (let i = str.length; i >= 0; i--) {
        if (str[i] === '/') {
            return i;
        }
    }
}