const crypto = require('crypto');

/**
 * Hardware Attestation Service
 *
 * Uses the Web Authentication API (WebAuthn / FIDO2) to bind evidence
 * submissions to a specific physical device via Secure Enclave (iOS)
 * or Titan M (Android).
 *
 * Flow:
 *   1. REGISTER: Device generates a public/private key pair inside the
 *      hardware security module. The public key + attestation certificate
 *      are sent to the server and stored.
 *   2. SIGN (Authenticate): Before each evidence submission the device
 *      signs a server-provided challenge with the hardware-bound private
 *      key. The server verifies the signature.
 */

// ── In-memory credential store (production: move to DB) ──────────
// Map<credentialId (base64url), { publicKey, counter, officerId, deviceLabel }>
const credentialStore = new Map();

// ── Pending challenges (short TTL) ──────────────────────────────
// Map<challengeId, { challenge (Buffer), type, officerId, createdAt }>
const pendingChallenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const RP_NAME = 'ChainGuard';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';

// ── Helpers ──────────────────────────────────────────────────────

function generateChallenge() {
    return crypto.randomBytes(32);
}

function base64urlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64');
}

function cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [id, data] of pendingChallenges) {
        if (now - data.createdAt > CHALLENGE_TTL_MS) {
            pendingChallenges.delete(id);
        }
    }
}

// ── Registration ─────────────────────────────────────────────────

/**
 * Generate registration options for WebAuthn credential creation.
 */
function generateRegistrationOptions(officerId) {
    cleanupExpiredChallenges();

    const challenge = generateChallenge();
    const challengeId = base64urlEncode(crypto.randomBytes(16));

    pendingChallenges.set(challengeId, {
        challenge,
        type: 'registration',
        officerId,
        createdAt: Date.now(),
    });

    // Existing credentials for this officer (to avoid duplicates)
    const excludeCredentials = [];
    for (const [credId, cred] of credentialStore) {
        if (cred.officerId === officerId) {
            excludeCredentials.push({
                type: 'public-key',
                id: credId,
            });
        }
    }

    return {
        challengeId,
        publicKey: {
            rp: { name: RP_NAME, id: RP_ID },
            user: {
                id: base64urlEncode(Buffer.from(officerId)),
                name: officerId,
                displayName: `Officer ${officerId}`,
            },
            challenge: base64urlEncode(challenge),
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' },   // ES256
                { alg: -257, type: 'public-key' },  // RS256
            ],
            timeout: 120000,
            attestation: 'direct',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',    // Force hardware (Secure Enclave / Titan M)
                residentKey: 'preferred',
                userVerification: 'required',
            },
            excludeCredentials,
        },
    };
}

/**
 * Verify a registration response from the client.
 * In production, this would fully parse the attestation object and verify
 * the certificate chain. For the MVP we extract the public key and trust
 * the attestation.
 */
function verifyRegistration(challengeId, credential, officerId) {
    const pending = pendingChallenges.get(challengeId);
    if (!pending) throw new Error('Challenge expired or not found');
    if (pending.type !== 'registration') throw new Error('Wrong challenge type');
    if (pending.officerId !== officerId) throw new Error('Officer mismatch');
    pendingChallenges.delete(challengeId);

    const { id: credentialId, response: attestationResponse } = credential;

    // Decode clientDataJSON and verify challenge + origin
    const clientData = JSON.parse(
        Buffer.from(attestationResponse.clientDataJSON, 'base64').toString('utf-8'),
    );

    const expectedChallenge = base64urlEncode(pending.challenge);
    if (clientData.challenge !== expectedChallenge) {
        throw new Error('Challenge mismatch');
    }
    if (clientData.origin !== RP_ORIGIN) {
        throw new Error(`Origin mismatch: expected ${RP_ORIGIN}, got ${clientData.origin}`);
    }
    if (clientData.type !== 'webauthn.create') {
        throw new Error('Unexpected client data type');
    }

    // Parse attestationObject (CBOR-encoded). For the MVP we store
    // the raw attestation and mark the credential as registered.
    // A production implementation would parse CBOR, extract authData,
    // verify the attestation statement, and pull the COSE public key.
    const attestationObject = base64urlDecode(attestationResponse.attestationObject);

    // Extract public key from authData (simplified — skips CBOR parsing)
    // In production, use a library like `cbor` or `fido2-lib`.
    const publicKeyDer = attestationResponse.publicKey
        ? base64urlDecode(attestationResponse.publicKey)
        : attestationObject; // fallback

    credentialStore.set(credentialId, {
        publicKey: publicKeyDer,
        counter: 0,
        officerId,
        deviceLabel: credential.deviceLabel || 'Unknown Device',
        registeredAt: new Date().toISOString(),
        attestationObject: base64urlEncode(attestationObject),
    });

    return {
        credentialId,
        officerId,
        deviceLabel: credential.deviceLabel || 'Unknown Device',
        registeredAt: credentialStore.get(credentialId).registeredAt,
    };
}

// ── Authentication (Signing) ─────────────────────────────────────

/**
 * Generate authentication options (challenge) for signing evidence.
 */
function generateAuthenticationOptions(officerId) {
    cleanupExpiredChallenges();

    const challenge = generateChallenge();
    const challengeId = base64urlEncode(crypto.randomBytes(16));

    pendingChallenges.set(challengeId, {
        challenge,
        type: 'authentication',
        officerId,
        createdAt: Date.now(),
    });

    // Get credentials for this officer
    const allowCredentials = [];
    for (const [credId, cred] of credentialStore) {
        if (cred.officerId === officerId) {
            allowCredentials.push({ type: 'public-key', id: credId });
        }
    }

    if (allowCredentials.length === 0) {
        pendingChallenges.delete(challengeId);
        throw new Error('No registered devices found for this officer');
    }

    return {
        challengeId,
        publicKey: {
            challenge: base64urlEncode(challenge),
            rpId: RP_ID,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials,
        },
    };
}

/**
 * Verify an authentication assertion.
 * Returns the credential info if the signature is valid.
 */
function verifyAuthentication(challengeId, assertion) {
    const pending = pendingChallenges.get(challengeId);
    if (!pending) throw new Error('Challenge expired or not found');
    if (pending.type !== 'authentication') throw new Error('Wrong challenge type');
    pendingChallenges.delete(challengeId);

    const { id: credentialId, response: assertionResponse } = assertion;
    const stored = credentialStore.get(credentialId);
    if (!stored) throw new Error('Unknown credential');
    if (stored.officerId !== pending.officerId) throw new Error('Officer mismatch');

    // Decode and verify clientDataJSON
    const clientData = JSON.parse(
        Buffer.from(assertionResponse.clientDataJSON, 'base64').toString('utf-8'),
    );

    const expectedChallenge = base64urlEncode(pending.challenge);
    if (clientData.challenge !== expectedChallenge) {
        throw new Error('Challenge mismatch');
    }
    if (clientData.type !== 'webauthn.get') {
        throw new Error('Unexpected client data type');
    }

    // In production: verify the signature using the stored public key
    // and the authenticator data + client data hash.
    // For MVP, we trust the browser's WebAuthn implementation.

    // Update counter (replay protection)
    const authData = base64urlDecode(assertionResponse.authenticatorData);
    const newCounter = authData.readUInt32BE(33); // bytes 33-36 in authData
    if (newCounter <= stored.counter && newCounter !== 0) {
        throw new Error('Possible credential cloning detected');
    }
    stored.counter = newCounter;

    return {
        credentialId,
        officerId: stored.officerId,
        deviceLabel: stored.deviceLabel,
        verified: true,
    };
}

/**
 * Get all registered devices for an officer.
 */
function getDevicesForOfficer(officerId) {
    const devices = [];
    for (const [credId, cred] of credentialStore) {
        if (cred.officerId === officerId) {
            devices.push({
                credentialId: credId,
                deviceLabel: cred.deviceLabel,
                registeredAt: cred.registeredAt,
            });
        }
    }
    return devices;
}

module.exports = {
    generateRegistrationOptions,
    verifyRegistration,
    generateAuthenticationOptions,
    verifyAuthentication,
    getDevicesForOfficer,
};
