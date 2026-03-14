/**
 * ChainGuard — Hardware Attestation Client
 *
 * Uses the Web Authentication API (WebAuthn / FIDO2) to register the
 * device's hardware security module and sign evidence submissions.
 */

const ATTESTATION_BASE = '/api/attestation';

/**
 * Check if WebAuthn is supported in this browser.
 */
export function isWebAuthnSupported() {
    return !!window.PublicKeyCredential;
}

/**
 * Check if a platform authenticator (Secure Enclave / Titan M) is available.
 */
export async function isPlatformAuthenticatorAvailable() {
    if (!isWebAuthnSupported()) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function base64urlToBuffer(base64url) {
    let str = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAuthHeaders() {
    // Reuse the dev token mechanism from ApiService
    try {
        const res = await fetch('/api/evidence/mock-token');
        const data = await res.json();
        return { 'Authorization': `Bearer ${data.token}`, 'Content-Type': 'application/json' };
    } catch {
        return { 'Content-Type': 'application/json' };
    }
}

// ── Registration ─────────────────────────────────────────────────

/**
 * Register this device's hardware authenticator.
 * @returns {{ credentialId, officerId, deviceLabel }}
 */
export async function registerDevice(deviceLabel = 'Mobile Device') {
    const headers = await getAuthHeaders();

    // 1. Get registration options from server
    const optionsRes = await fetch(`${ATTESTATION_BASE}/register/options`, {
        method: 'POST',
        headers,
    });
    const optionsPayload = await optionsRes.json();
    if (!optionsPayload.success) throw new Error(optionsPayload.error?.message || 'Failed to get options');

    const { challengeId, publicKey: serverOptions } = optionsPayload.data;

    // 2. Convert base64url fields to ArrayBuffers for the browser API
    const publicKeyOptions = {
        ...serverOptions,
        challenge: base64urlToBuffer(serverOptions.challenge),
        user: {
            ...serverOptions.user,
            id: base64urlToBuffer(serverOptions.user.id),
        },
        excludeCredentials: (serverOptions.excludeCredentials || []).map(c => ({
            ...c,
            id: base64urlToBuffer(c.id),
        })),
    };

    // 3. Call the browser's WebAuthn API (triggers biometric / PIN prompt)
    const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });

    // 4. Serialize the response for the server
    const registrationData = {
        challengeId,
        credential: {
            id: credential.id,
            type: credential.type,
            deviceLabel,
            response: {
                clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
                attestationObject: bufferToBase64url(credential.response.attestationObject),
                publicKey: credential.response.getPublicKey
                    ? bufferToBase64url(credential.response.getPublicKey())
                    : null,
            },
        },
    };

    // 5. Send to server for verification
    const verifyRes = await fetch(`${ATTESTATION_BASE}/register/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify(registrationData),
    });
    const verifyPayload = await verifyRes.json();
    if (!verifyPayload.success) throw new Error(verifyPayload.error?.message || 'Registration failed');

    // Store credential ID locally
    localStorage.setItem('cg_credential_id', credential.id);

    return verifyPayload.data;
}

// ── Authentication (Evidence Signing) ────────────────────────────

/**
 * Sign a challenge with the device's hardware key.
 * Call this before submitting evidence to prove device authenticity.
 * @returns {{ credentialId, officerId, verified }}
 */
export async function signWithDevice() {
    const headers = await getAuthHeaders();

    // 1. Get authentication options
    const optionsRes = await fetch(`${ATTESTATION_BASE}/authenticate/options`, {
        method: 'POST',
        headers,
    });
    const optionsPayload = await optionsRes.json();
    if (!optionsPayload.success) throw new Error(optionsPayload.error?.message || 'No registered device');

    const { challengeId, publicKey: serverOptions } = optionsPayload.data;

    // 2. Convert for browser API
    const publicKeyOptions = {
        ...serverOptions,
        challenge: base64urlToBuffer(serverOptions.challenge),
        allowCredentials: (serverOptions.allowCredentials || []).map(c => ({
            ...c,
            id: base64urlToBuffer(c.id),
        })),
    };

    // 3. Trigger biometric / PIN on the device
    const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

    // 4. Serialize
    const assertionData = {
        challengeId,
        assertion: {
            id: assertion.id,
            type: assertion.type,
            response: {
                clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
                authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
                signature: bufferToBase64url(assertion.response.signature),
                userHandle: assertion.response.userHandle
                    ? bufferToBase64url(assertion.response.userHandle)
                    : null,
            },
        },
    };

    // 5. Verify on server
    const verifyRes = await fetch(`${ATTESTATION_BASE}/authenticate/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify(assertionData),
    });
    const verifyPayload = await verifyRes.json();
    if (!verifyPayload.success) throw new Error(verifyPayload.error?.message || 'Device auth failed');

    return verifyPayload.data;
}

// ── Device Management ────────────────────────────────────────────

/**
 * List all registered devices for the current officer.
 */
export async function listDevices() {
    const headers = await getAuthHeaders();
    const res = await fetch(`${ATTESTATION_BASE}/devices`, { headers });
    const payload = await res.json();
    if (!payload.success) throw new Error('Failed to list devices');
    return payload.data.devices;
}

/**
 * Check if this device has been registered.
 */
export function isDeviceRegistered() {
    return !!localStorage.getItem('cg_credential_id');
}
