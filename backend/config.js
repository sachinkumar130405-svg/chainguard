const path = require("path");

// Load .env if present (optional dependency)
try { require("dotenv").config({ path: path.join(__dirname, ".env") }); } catch (_) { /* dotenv not installed — using defaults */ }

module.exports = {
    port: parseInt(process.env.PORT, 10) || 3001,
    nodeEnv: process.env.NODE_ENV || "development",

    blockchain: {
        url: process.env.BLOCKCHAIN_URL || "http://127.0.0.1:8545",
    },

    jwt: {
        secret: process.env.JWT_SECRET || "chainguard-dev-secret-change-in-production",
        expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    },

    db: {
        path: process.env.DB_PATH
            ? path.resolve(process.env.DB_PATH)
            : path.join(__dirname, "data", "chainguard.db"),
    },

    cors: {
        origins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(","),
    },

    storage: {
        uploadDir: process.env.UPLOAD_DIR
            ? path.resolve(process.env.UPLOAD_DIR)
            : path.join(__dirname, "uploads"),
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50 MB
    },

    rateLimit: {
        submit:  { windowMs: 60_000, max: 30 },
        upload:  { windowMs: 60_000, max: 10 },
        verify:  { windowMs: 60_000, max: 60 },
        general: { windowMs: 60_000, max: 120 },
    },
};
