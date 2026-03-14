const express = require('express');
const auth = require('../middleware/auth');
const attestation = require('../services/attestation');

const router = express.Router();

/**
 * POST /api/attestation/register/options
 * Generate WebAuthn registration options for device enrollment.
 */
router.post('/register/options', auth, (req, res) => {
    try {
        const officerId = req.user.badge || req.user.sub || 'unknown';
        const options = attestation.generateRegistrationOptions(officerId);

        return res.json({
            success: true,
            data: options,
        });
    } catch (err) {
        console.error('Attestation register options error:', err);
        return res.status(500).json({
            success: false,
            error: { code: 'ATTESTATION_ERROR', message: err.message },
        });
    }
});

/**
 * POST /api/attestation/register/verify
 * Verify a WebAuthn registration response and store the credential.
 */
router.post('/register/verify', auth, (req, res) => {
    try {
        const officerId = req.user.badge || req.user.sub || 'unknown';
        const { challengeId, credential } = req.body;

        if (!challengeId || !credential) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'challengeId and credential are required' },
            });
        }

        const result = attestation.verifyRegistration(challengeId, credential, officerId);

        return res.status(201).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error('Attestation register verify error:', err);
        return res.status(400).json({
            success: false,
            error: { code: 'REGISTRATION_FAILED', message: err.message },
        });
    }
});

/**
 * POST /api/attestation/authenticate/options
 * Generate WebAuthn authentication options (challenge for signing).
 */
router.post('/authenticate/options', auth, (req, res) => {
    try {
        const officerId = req.user.badge || req.user.sub || 'unknown';
        const options = attestation.generateAuthenticationOptions(officerId);

        return res.json({
            success: true,
            data: options,
        });
    } catch (err) {
        console.error('Attestation auth options error:', err);
        const status = err.message.includes('No registered devices') ? 404 : 500;
        return res.status(status).json({
            success: false,
            error: { code: 'ATTESTATION_ERROR', message: err.message },
        });
    }
});

/**
 * POST /api/attestation/authenticate/verify
 * Verify a WebAuthn authentication assertion (device signature).
 */
router.post('/authenticate/verify', auth, (req, res) => {
    try {
        const { challengeId, assertion } = req.body;

        if (!challengeId || !assertion) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'challengeId and assertion are required' },
            });
        }

        const result = attestation.verifyAuthentication(challengeId, assertion);

        return res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error('Attestation auth verify error:', err);
        return res.status(401).json({
            success: false,
            error: { code: 'AUTHENTICATION_FAILED', message: err.message },
        });
    }
});

/**
 * GET /api/attestation/devices
 * List all registered devices for the authenticated officer.
 */
router.get('/devices', auth, (req, res) => {
    const officerId = req.user.badge || req.user.sub || 'unknown';
    const devices = attestation.getDevicesForOfficer(officerId);

    return res.json({
        success: true,
        data: { devices },
    });
});

module.exports = router;
