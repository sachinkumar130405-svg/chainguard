/**
 * Evidence Backend API Service
 */

const BASE_URL = (() => {
    const url = import.meta.env.VITE_API_URL;
    if (!url) {
        if (import.meta.env.DEV) {
            console.info('[ChainGuard] VITE_API_URL not set — API calls will be proxied via Vite dev server.');
        }
        return ''; // In dev, Vite's proxy (/api → localhost:3001) handles routing
    }
    return url;
})();
const API_BASE = `${BASE_URL}/api/evidence`;
const VERIFY_ENDPOINT = `${API_BASE}/verify`;

let authToken = localStorage.getItem('authToken') || null;

export async function login(username, password) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
        return true;
    }
    throw new Error(data.error?.message || 'Login failed');
}

export function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
}

export function getAuthToken() {
    return authToken;
}

export async function verifyWithBackend(file, hash) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Verify request failed with status ${response.status}`);
    }

    const payload = await response.json();

    if (!payload.success || !payload.verified || !payload.data || !payload.data.match) {
        return null;
    }

    const rec = payload.data.record || {};
    const meta = rec.metadata || {};

    return {
        evidenceId: rec.evidenceId,
        transactionHash: rec.transactionHash,
        blockNumber: rec.blockNumber,
        anchoredAt: rec.anchoredAt,
        officerId: meta.officerId || rec.officerId || 'UNKNOWN',
        latitude: typeof meta.latitude === 'number' ? meta.latitude : (rec.latitude || 0),
        longitude: typeof meta.longitude === 'number' ? meta.longitude : (rec.longitude || 0),
    };
}

export async function submitWithBackend(file, hash, metadata, onStateChange) {
    const authHeader = { 'Authorization': `Bearer ${authToken}` };

    // 1. Anchor to chain
    if (onStateChange) onStateChange('submitting');
    const submitRes = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ fileHash: hash, metadata }),
    });

    const submitPayload = await submitRes.json();
    if (!submitRes.ok || !submitPayload.success) {
        if (submitPayload.error?.code === 'DUPLICATE_HASH') {
            throw new Error('DUPLICATE: This evidence hash has already been anchored.');
        }
        throw new Error(submitPayload.error?.message || 'Submission failed');
    }

    const evidenceId = submitPayload.data.evidenceId;

    // Returning the part of the payload we need for the next steps
    return {
        evidenceId,
        transactionHash: submitPayload.data.transactionHash,
        blockNumber: submitPayload.data.blockNumber,
        anchoredAt: submitPayload.data.anchoredAt,
        authHeader
    };
}

export async function uploadEncryptedFile(evidenceId, encryptedBlob, iv, mimeType, authHeader) {
    const fd = new FormData();
    fd.append('evidenceId', evidenceId);
    fd.append('iv', iv);
    fd.append('mimeType', mimeType);
    fd.append('encryptedFile', encryptedBlob, 'evidence.enc');

    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: authHeader,
        body: fd,
    });

    const uploadPayload = await uploadRes.json();
    if (!uploadRes.ok || !uploadPayload.success) {
        throw new Error(uploadPayload.error?.message || 'Upload failed');
    }

    return uploadPayload.data;
}

export async function listEvidence(limit = 5) {
    const headers = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};

    const res = await fetch(`${API_BASE}?limit=${limit}`, { headers });
    if (!res.ok) throw new Error('Failed to list evidence');
    const payload = await res.json();
    return payload.data || [];
}
