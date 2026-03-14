/**
 * Cryptographic Utility Functions
 */

export function hexString(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
