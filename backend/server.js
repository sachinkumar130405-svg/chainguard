const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const evidenceRoutes = require("./routes/evidence");

const app = express();

// ──── Middleware ────
app.use(cors({
    origin: config.cors.origins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "10mb" }));

// Serve uploaded files (mock IPFS gateway)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ──── Health Check ────
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        service: "ChainGuard API",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
    });
});

// ──── Dev-only: generate test JWT ────
if (config.nodeEnv !== "production") {
    const { generateToken } = require("./middleware/auth");
    app.get("/api/dev/token", (req, res) => {
        const token = generateToken({
            sub: req.query.officerId || "officer_dev_001",
            name: req.query.name || "Dev Officer",
            badge: req.query.badge || "DEV-0001",
            role: "first_responder",
        });
        res.json({ token });
    });
}

// ──── Routes ────
app.use("/api/evidence", evidenceRoutes);

// ──── Error Handler ────
app.use((err, req, res, next) => {
    console.error("❌ Unhandled error:", err.message);
    res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: config.nodeEnv === "production"
                ? "An internal error occurred"
                : err.message,
        },
    });
});

// ──── Graceful Shutdown ────
process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    try { require("./db").close(); } catch (_) {}
    process.exit(0);
});

// ──── Start ────
app.listen(config.port, () => {
    console.log(`\n🛡️  ChainGuard API running on http://localhost:${config.port}`);
    console.log(`   Health: http://localhost:${config.port}/api/health`);
    console.log(`   Evidence API: http://localhost:${config.port}/api/evidence`);
    if (config.nodeEnv !== "production") {
        console.log(`   Dev Token: http://localhost:${config.port}/api/dev/token`);
    }
    console.log();
});

module.exports = app;
