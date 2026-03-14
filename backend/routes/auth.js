const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { createPerMinuteLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/auth/login
router.post('/login', createPerMinuteLimiter(10), (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_CREDENTIALS', message: 'Username and password required' }
        });
    }

    // In a real app, you would verify against a users table in the DB.
    // For this MVP, we provide a mock path or a hardcoded secure admin.
    const isMockDemo = config.useMockAuth && username === 'demo' && password === 'demo';
    const isRealAdmin = username === 'admin' && password === 'Admin123!'; // Example "real" auth

    if (isMockDemo || isRealAdmin) {
        const payload = {
            sub: username,
            badge: `NYPD-${username.toUpperCase()}-01`,
            role: config.jwt.requiredRole
        };

        const token = jwt.sign(payload, config.jwt.secret, {
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
            expiresIn: '24h'
        });

        return res.json({ success: true, token });
    }

    return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }
    });
});

module.exports = router;
