/**
 * JWT Authentication Middleware.
 *
 * Verifies the Bearer token from the Authorization header and
 * attaches the decoded officer payload to req.officer.
 */
const jwt = require("jsonwebtoken");
const config = require("../config");

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            error: {
                code: "UNAUTHORIZED",
                message: "Invalid or expired authentication token",
            },
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.officer = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: {
                code: "UNAUTHORIZED",
                message: "Invalid or expired authentication token",
            },
        });
    }
}

/**
 * Generate a signed JWT (useful for development / testing).
 */
function generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    });
}

module.exports = { authenticate, generateToken };
