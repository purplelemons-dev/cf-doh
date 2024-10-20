import type { RequestEvent } from "@sveltejs/kit";
import {
    type ParsedDNSResponse,
    parseDnsQuery,
    parseDnsResponse,
    serializeDnsResponse,
} from "./dns";

export const base64UrlDecode = (base64Url: string) => {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(
        base64.length + (4 - (base64.length % 4)) % 4,
        "=",
    );

    return Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0));
};

export class Query {
    raw;
    parsed;

    constructor(query: Uint8Array<ArrayBuffer>) {
        this.raw = query;
        this.parsed = parseDnsQuery(query);
    }

    toString() {
        return JSON.stringify(
            this.parsed,
            null,
            2,
        );
    }
}

const postCacheOps = async (
    response: Response,
    e: RequestEvent,
) => {
    const parsedResponse = parseDnsResponse(
        new Uint8Array(await response.arrayBuffer()),
    );

    const answer = parsedResponse.answers[0];

    // Remove name because it's used as the key
    const entry = {
        type: answer.type,
        classCode: answer.classCode,
        ttl: answer.ttl,
        rdata: answer.rdata,
    };

    await e.platform?.env.dnscache.put(
        answer.name,
        JSON.stringify(entry),
        {
            expirationTtl: Math.max(answer.ttl, 60),
        },
    );
};

const nullIP = (type: number) => {
    switch (type) {
        case 1:
            return "0.0.0.0";
        case 28:
            return "::";
        case 5:
            return "null.purplelemons.dev.";
        default:
            return "";
    }
};

export const handleQuery = async (dnsQuery: Query, e: RequestEvent) => {
    console.log(dnsQuery);

    // Check if domain is blocked:
    const blocked: boolean = JSON.parse(
        await e.platform?.env.dnscache.get(
            // FQDN blocked
            `blocked:${dnsQuery.parsed.questions[0].name}`,
        ) || e.platform?.env.dnscache.get(
            // Apex domain blocked
            `blocked:*.${
                dnsQuery.parsed.questions[0].name.split(".").slice(-3).join(
                    ".",
                )
            }`,
            // Not found, so it should be allowed
        ) || "false",
    );

    if (blocked) {
        const responseBody = serializeDnsResponse({
            header: {
                id: dnsQuery.parsed.header.id,
                flags: dnsQuery.parsed.header.flags,
                qdcount: 1,
                ancount: 1,
                nscount: 0,
                arcount: 0,
            },
            answers: [{
                name: dnsQuery.parsed.questions[0].name,
                type: dnsQuery.parsed.questions[0].type,
                classCode: dnsQuery.parsed.questions[0].classCode,
                ttl: 0,
                rdata: nullIP(dnsQuery.parsed.questions[0].type),
            }],
        });

        return new Response(responseBody, {
            status: 200,
            headers: {
                "Content-Type": "application/dns-message",
            },
        });
    } else {
        // check cache
        const cache = await e.platform?.env.dnscache.get(
            dnsQuery.parsed.questions[0].name,
        );

        if (cache) {
            const entry = JSON.parse(cache);

            const responseBody = serializeDnsResponse({
                header: {
                    id: dnsQuery.parsed.header.id,
                    flags: dnsQuery.parsed.header.flags,
                    qdcount: 1,
                    ancount: 1,
                    nscount: 0, // /!\ These lines look like they could cause trouble
                    arcount: 0,
                },
                answers: [{
                    name: dnsQuery.parsed.questions[0].name,
                    type: entry.type,
                    classCode: entry.classCode,
                    ttl: entry.ttl,
                    rdata: entry.rdata,
                }],
            });

            return new Response(responseBody, {
                status: 200,
                headers: {
                    "Content-Type": "application/dns-message",
                },
            });
        } else {
            const response = await fetch(
                `https://cloudflare-dns.com/dns-query`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/dns-message",
                        "Accept": "application/dns-message",
                        "User-Agent":
                            "github.com/purplelemons-dev/cf-doh#hi-cf-team",
                    },
                    body: dnsQuery.raw,
                },
            );

            e.platform?.ctx.waitUntil(postCacheOps(response, e));

            return response;
        }
    }
};
