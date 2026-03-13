/**
 * Storage Service — Mock IPFS / Decentralized Storage
 *
 * In production, this would pin files to IPFS via Pinata or Web3.Storage.
 * For the MVP, files are stored locally in an /uploads directory and
 * given a CID-like content-addressed identifier.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config");

const UPLOAD_DIR = config.storage.uploadDir;

// Ensure uploads dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Store a file buffer and return a mock IPFS CID.
 * The CID is derived from the SHA-256 of the file content.
 */
async function store(buffer, originalName) {
    // Generate a content-based identifier (like IPFS CID)
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const cid = `Qm${hash.slice(0, 44)}`; // Mock CID format

    // Determine file extension
    const ext = path.extname(originalName) || ".bin";
    const filename = `${cid}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Write file
    fs.writeFileSync(filepath, buffer);

    return {
        cid,
        url: `http://localhost:3001/uploads/${filename}`,
        filepath,
        size: buffer.length,
    };
}

/**
 * Retrieve a stored file by its CID.
 */
async function retrieve(cid) {
    const files = fs.readdirSync(UPLOAD_DIR);
    const match = files.find((f) => f.startsWith(cid));

    if (!match) {
        return null;
    }

    const filepath = path.join(UPLOAD_DIR, match);
    return {
        cid,
        buffer: fs.readFileSync(filepath),
        filename: match,
        size: fs.statSync(filepath).size,
    };
}

module.exports = { store, retrieve };
