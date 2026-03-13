/**
 * Hashing Service — Server-side SHA-256 utilities.
 */
const crypto = require("crypto");

/** Compute SHA-256 of a Buffer. Returns hex string. */
function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Compute SHA-256 of a UTF-8 string. Returns hex string. */
function sha256String(str) {
    return crypto.createHash("sha256").update(str).digest("hex");
}

/** Validate that a string is a 64-char lowercase hex hash. */
function isValidHash(hash) {
    return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
}

module.exports = { sha256, sha256String, isValidHash };
