import { parseDnsQuery } from "./dns";

const base64UrlDecode = (base64Url: string) => {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');

    return Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0));
}


export class Query {
    queryString: string;
    parsed;

    constructor(queryString: string) {
        this.queryString = queryString;
        const decoded = base64UrlDecode(queryString);
        this.parsed = parseDnsQuery(decoded);
    }
}

export const handleQuery = async (dnsQuery: Query) => {
    return await fetch(`https://cloudflare-dns.com/dns-query?dns=${dnsQuery.queryString}`);
};
