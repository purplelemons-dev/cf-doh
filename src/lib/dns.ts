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

    // Parse questions (we assume one question here for simplicity)
    const questions = [];
    for (let i = 0; i < header.qdcount; i++) {
        const question = parseDnsQuestion(buffer, offset);
        questions.push(question);
        offset = question.offset; // Update offset after parsing the question
    }

    return { header, questions };
}

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
        offset, // Return the updated offset for further parsing
    };
}

// Helper function to parse a DNS name (handles compressed names)
const parseDnsName = (buffer: Uint8Array<ArrayBuffer>, offset: number) => {
    let name = '';
    let length = buffer[offset++];

    while (length > 0) {
        if ((length & 0xc0) === 0xc0) { // Check for name compression
            const pointer = ((length & 0x3f) << 8) | buffer[offset++];
            const { name: pointedName } = parseDnsName(buffer, pointer);
            name += pointedName;
            break;
        } else {
            name += String.fromCharCode(...buffer.slice(offset, offset + length)) + '.';
            offset += length;
            length = buffer[offset++];
        }
    }

    return { name, newOffset: offset };
}
