/**
 * Cryptographic Utility Functions
 *
 * BROWSER COMPATIBILITY NOTE:
 * These functions rely on the Web Crypto API, specifically `crypto.subtle`.
 * They require a secure context (HTTPS or localhost) to function.
 * AES-GCM encryption is supported in all modern browsers (Chrome 37+, Firefox 34+, Safari 10+, Edge 79+).
 * File hashing (SHA-256) is also widely supported in modern browsers.
 */

/**
 * Converts an ArrayBuffer to a hexadecimal string representation.
 *
 * @param {ArrayBuffer} buffer - The buffer to convert to hex.
 * @returns {string} The hex string representation of the buffer.
 */
export function hexString(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the SHA-256 hash of a file, simulating streaming for large files to avoid blocking the main thread.
 * Note: `crypto.subtle.digest` currently requires the entire buffer in memory anyway, but this sets up the UI progressing.
 * 
 * @param {File} file - The file to hash.
 * @param {function(number): void} onProgress - Callback function that receives the number of bytes processed.
 * @returns {Promise<string>} A promise that resolves strictly with the hex string of the SHA-256 hash.
 */
export async function hashFileStreaming(file, onProgress) {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks

    if (file.size < CHUNK_SIZE * 2) {
        onProgress(0);
        const buffer = await file.arrayBuffer();
        onProgress(file.size);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return hexString(hashBuffer);
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        let offset = 0;

        const progressInterval = setInterval(() => {
            offset = Math.min(offset + CHUNK_SIZE, file.size);
            onProgress(offset);
            if (offset >= file.size) clearInterval(progressInterval);
        }, 120);

        reader.onload = async () => {
            clearInterval(progressInterval);
            onProgress(file.size);
            try {
                const hashBuffer = await crypto.subtle.digest('SHA-256', reader.result);
                resolve(hexString(hashBuffer));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => { clearInterval(progressInterval); reject(reader.error); };
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Encrypts a file using AES-GCM with a securely generated 256-bit key.
 * 
 * SECURITY EXPECTATIONS:
 * - A unique symmetric encryption key (AES-GCM, 256-bit) and initialization vector (IV) are generated per file.
 * - The `key` returned is a CryptoKey object marked as `extractable: true`.
 * - The invoking code is responsible for exporting and securely managing this key. 
 *   If the key is lost, the encrypted file cannot be deciphered.
 *
 * @param {File} file - The file to encrypt.
 * @returns {Promise<{encryptedBlob: Blob, iv: string, key: CryptoKey}>} A promise that resolves to an object containing the encrypted `Blob`, the hex-encoded initialization vector (`iv`), and the generated `CryptoKey`.
 */
export async function encryptFile(file) {
    const buffer = await file.arrayBuffer();

    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        buffer
    );

    return {
        encryptedBlob: new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        iv: hexString(iv),
        key: key
    };
}
