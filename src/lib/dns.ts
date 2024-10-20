export const parseDnsQuery = (buffer: Uint8Array<ArrayBuffer>) => {
    let offset = 0;

    // DNS Header: First 12 bytes
    const header = {
        id: (buffer[offset++] << 8) | buffer[offset++], // Transaction ID
        flags: (buffer[offset++] << 8) | buffer[offset++], // Flags
        qdcount: (buffer[offset++] << 8) | buffer[offset++], // Number of questions
        ancount: (buffer[offset++] << 8) | buffer[offset++], // Number of answers
        nscount: (buffer[offset++] << 8) | buffer[offset++], // Number of authority records
        arcount: (buffer[offset++] << 8) | buffer[offset++], // Number of additional records
    };

    header.qdcount = 1; // We only support one question for simplicity

    // Parse questions (we assume one question here for simplicity)
    const questions = [];
    for (let i = 0; i < header.qdcount; i++) {
        const question = parseDnsQuestion(buffer, offset);
        questions.push(question);
        offset = question.newOffset; // Update offset after parsing the question
    }

    return { header, questions };
};

// Function to parse a DNS question section
const parseDnsQuestion = (buffer: Uint8Array<ArrayBuffer>, offset: number) => {
    const { name, newOffset } = parseDnsName(buffer, offset);
    offset = newOffset;

    const type = (buffer[offset++] << 8) | buffer[offset++];
    const classCode = (buffer[offset++] << 8) | buffer[offset++];

    return {
        name,
        type,
        classCode,
        newOffset: offset, // Return the updated offset for further parsing
    };
};

// Helper function to parse a DNS name (handles compressed names)
const parseDnsName = (buffer: Uint8Array<ArrayBuffer>, offset: number) => {
    let name = "";
    let length = buffer[offset++];

    while (length > 0) {
        if ((length & 0xc0) === 0xc0) { // Check for name compression
            const pointer = ((length & 0x3f) << 8) | buffer[offset++];
            const { name: pointedName } = parseDnsName(buffer, pointer);
            name += pointedName;
            break;
        } else {
            name +=
                String.fromCharCode(...buffer.slice(offset, offset + length)) +
                ".";
            offset += length;
            length = buffer[offset++];
        }
    }

    return { name, newOffset: offset };
};

export interface ParsedDNSResponse {
    header: {
        id: number;
        flags: number;
        qdcount: number;
        ancount: number;
        nscount: number;
        arcount: number;
    };
    answers: {
        name: string;
        type: number;
        classCode: number;
        ttl: number;
        expiration?: number;
        rdata: string;
        offset?: number;
    }[];
}

export const parseDnsResponse = (
    buffer: Uint8Array<ArrayBuffer>,
): ParsedDNSResponse => {
    let offset = 0;

    // Parse DNS header
    const header = {
        id: (buffer[offset++] << 8) | buffer[offset++],
        flags: (buffer[offset++] << 8) | buffer[offset++],
        qdcount: (buffer[offset++] << 8) | buffer[offset++],
        ancount: (buffer[offset++] << 8) | buffer[offset++],
        nscount: (buffer[offset++] << 8) | buffer[offset++],
        arcount: (buffer[offset++] << 8) | buffer[offset++],
    };

    // Skip question section (as we're focusing on answers)
    for (let i = 0; i < header.qdcount; i++) {
        const { newOffset } = parseDnsQuestion(buffer, offset);
        offset = newOffset;
    }

    // Parse answer section
    const answers = [];
    for (let i = 0; i < header.ancount; i++) {
        const answer = parseDnsAnswer(buffer, offset);
        answers.push(answer);
        offset = answer.offset;
    }

    return { header, answers };
};

const parseDnsAnswer = (buffer: Uint8Array<ArrayBuffer>, offset: number) => {
    const { name, newOffset } = parseDnsName(buffer, offset);
    offset = newOffset;

    const type = (buffer[offset++] << 8) | buffer[offset++];
    const classCode = (buffer[offset++] << 8) | buffer[offset++];
    const ttl = (buffer[offset++] << 24) |
        (buffer[offset++] << 16) |
        (buffer[offset++] << 8) |
        buffer[offset++];

    const expiration = Date.now() + ttl * 1000;

    const rdLength = (buffer[offset++] << 8) | buffer[offset++];
    const rdata = parseRdata(buffer, offset, rdLength, type);

    offset += rdLength;

    return { name, type, classCode, ttl, expiration, rdata, offset };
};

const toHexString = (byteArray: Uint8Array<ArrayBuffer>) => {
    return Array.from(byteArray, (byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

const parseRdata = (
    buffer: Uint8Array<ArrayBuffer>,
    offset: number,
    length: number,
    type: number,
) => {
    switch (type) {
        case 1: // A record (IPv4 address)
            return Array.from(buffer.slice(offset, offset + length)).join(".");
        case 28: // AAAA record (IPv6 address)
            return Array.from(buffer.slice(offset, offset + length))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join(":");
        case 5: // CNAME record
            return parseDnsName(buffer, offset).name;
        default:
            // Use the toHexString helper for unsupported types
            return toHexString(buffer.slice(offset, offset + length));
    }
};

export const serializeDnsResponse = (parsedResponse: ParsedDNSResponse) => {
    const headerBuffer = new ArrayBuffer(12);
    const headerView = new DataView(headerBuffer);

    const { header, answers } = parsedResponse;

    // Write DNS Header (12 bytes)
    headerView.setUint16(0, header.id); // ID
    headerView.setUint16(2, header.flags); // Flags
    headerView.setUint16(4, header.qdcount); // Question Count
    headerView.setUint16(6, header.ancount); // Answer Count
    headerView.setUint16(8, header.nscount); // Authority Count
    headerView.setUint16(10, header.arcount); // Additional Count

    // Serialize answers
    const answerBuffers = answers.map((answer) => serializeDnsAnswer(answer));
    const totalLength = 12 +
        answerBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);

    // Combine header and answers into a single Uint8Array
    const combinedBuffer = new Uint8Array(totalLength);
    combinedBuffer.set(new Uint8Array(headerBuffer), 0);

    let offset = 12;
    for (const answerBuffer of answerBuffers) {
        combinedBuffer.set(new Uint8Array(answerBuffer), offset);
        offset += answerBuffer.byteLength;
    }

    return combinedBuffer;
};

interface DNSAnswer {
    name: string;
    type: number;
    classCode: number;
    ttl: number;
    rdata: string;
    offset?: number;
}

// Helper: Serialize a single DNS answer to ArrayBuffer
const serializeDnsAnswer = (answer: DNSAnswer) => {
    const nameBuffer = serializeDnsName(answer.name);
    const rdataBuffer = serializeRdata(answer.rdata, answer.type);

    const answerBuffer = new ArrayBuffer(
        nameBuffer.byteLength + 10 + rdataBuffer.byteLength,
    );
    const answerView = new DataView(answerBuffer);

    let offset = 0;

    // Write name
    new Uint8Array(answerBuffer).set(new Uint8Array(nameBuffer), offset);
    offset += nameBuffer.byteLength;

    // Write type, classCode, TTL, and rdata length
    answerView.setUint16(offset, answer.type);
    offset += 2;
    answerView.setUint16(offset, answer.classCode);
    offset += 2;
    answerView.setUint32(offset, answer.ttl);
    offset += 4;
    answerView.setUint16(offset, rdataBuffer.byteLength);
    offset += 2;

    // Write rdata
    new Uint8Array(answerBuffer).set(new Uint8Array(rdataBuffer), offset);

    return answerBuffer;
};

// Helper: Serialize DNS name into ArrayBuffer
const serializeDnsName = (name: string) => {
    const labels = name.split(".").filter((label) => label.length > 0);
    const buffers = labels.map((label) => {
        const buffer = new ArrayBuffer(label.length + 1);
        const view = new DataView(buffer);
        view.setUint8(0, label.length); // Label length
        for (let i = 0; i < label.length; i++) {
            view.setUint8(i + 1, label.charCodeAt(i)); // Label characters
        }
        return buffer;
    });

    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 1); // +1 for null terminator
    const nameBuffer = new ArrayBuffer(totalLength);
    const nameView = new Uint8Array(nameBuffer);

    let offset = 0;
    for (const buffer of buffers) {
        nameView.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }
    nameView[offset] = 0; // Null terminator

    return nameBuffer;
};

// Helper: Serialize RDATA based on record type
const serializeRdata = (rdata: string, type: number) => {
    switch (type) {
        case 1: // A record (IPv4)
            return new Uint8Array(
                rdata.split(".").map((octet) => parseInt(octet)),
            );
        case 28: // AAAA record (IPv6)
            const groups = rdata.split(":").map((group) => parseInt(group, 16));
            const buffer = new ArrayBuffer(16);
            const view = new DataView(buffer);
            groups.forEach((group, i) => view.setUint16(i * 2, group));
            return new Uint8Array(buffer);
        case 5: // CNAME record
            return new Uint8Array(serializeDnsName(rdata));
        default:
            throw new Error(`Unsupported RDATA type: ${type}`);
    }
};
