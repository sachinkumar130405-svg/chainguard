/**
 * Rate Limiting Middleware.
 *
 * Limits per the API contract:
 *   POST /submit  → 30 req/min per officer
 *   POST /upload  → 10 req/min per officer
 *   POST /verify  → 60 req/min per IP
 *   GET  /evidence → 120 req/min per token
 */
const rateLimit = require("express-rate-limit");
const config = require("../config");

const errorBody = {
    success: false,
    error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again later",
    },
};

const submitLimiter = rateLimit({
    windowMs: config.rateLimit.submit.windowMs,
    max: config.rateLimit.submit.max,
    keyGenerator: (req) => req.officer?.sub || req.ip,
    message: errorBody,
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: config.rateLimit.upload.windowMs,
    max: config.rateLimit.upload.max,
    keyGenerator: (req) => req.officer?.sub || req.ip,
    message: errorBody,
    standardHeaders: true,
    legacyHeaders: false,
});

const verifyLimiter = rateLimit({
    windowMs: config.rateLimit.verify.windowMs,
    max: config.rateLimit.verify.max,
    keyGenerator: (req) => req.ip,
    message: errorBody,
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = rateLimit({
    windowMs: config.rateLimit.general.windowMs,
    max: config.rateLimit.general.max,
    keyGenerator: (req) => req.officer?.sub || req.ip,
    message: errorBody,
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { submitLimiter, uploadLimiter, verifyLimiter, generalLimiter };
