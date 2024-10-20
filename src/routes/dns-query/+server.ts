import { type RequestHandler } from "@sveltejs/kit";
import { base64UrlDecode, handleQuery, Query } from "$lib";

export const GET: RequestHandler = async (request) => {
    const dnsQuery = request.url.searchParams.get("dns");
    if (!dnsQuery) {
        return new Response("Missing 'dns' query parameter", { status: 400 });
    }

    const decoded = base64UrlDecode(dnsQuery);

    const response = await handleQuery(new Query(decoded), request);
    return response;
};

export const POST: RequestHandler = async (request) => {
    // POST requests will have a binary body
    const dnsQuery = new Uint8Array(await request.request.arrayBuffer());
    if (!dnsQuery) {
        return new Response("Missing 'dns-message' body", { status: 400 });
    }

    const response = await handleQuery(new Query(dnsQuery), request);
    return response;
};
