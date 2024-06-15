import http from 'http';

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