import { type RequestHandler } from "@sveltejs/kit";
import { Query, handleQuery } from "$lib";

export const GET: RequestHandler = async (request) => {
    const dnsQuery = request.url.searchParams.get("dns");
    if (!dnsQuery) {
        return new Response("Missing 'dns' query parameter", { status: 400 });
    }

    const thisQuery = new Query(dnsQuery);

    const response = await handleQuery(thisQuery);
    return new Response();
};

export const POST: RequestHandler = async (request) => {
    const dnsQuery = await request.request.text();
    if (!dnsQuery) {
        return new Response("Missing 'dns' body", { status: 400 });
    }

    const thisQuery = new Query(dnsQuery);

    const response = await handleQuery(thisQuery);
    return new Response();
};
