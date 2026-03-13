const express = require("express");
const multer = require("multer");
const config = require("../config");
const blockchain = require("../services/blockchain");
const storage = require("../services/storage");
const hashing = require("../services/hashing");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { submitLimiter, uploadLimiter, verifyLimiter, generalLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Multer: in-memory storage, 50 MB limit per API contract
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.storage.maxFileSize },
});

// ──────────────────────────────────────
// POST /api/evidence/submit
// Anchor a file hash + metadata to the blockchain
// ──────────────────────────────────────
router.post("/submit", authenticate, submitLimiter, async (req, res) => {
    try {
        const { fileHash, metadata } = req.body;

        // Validate
        if (!fileHash || typeof fileHash !== "string") {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_HASH", message: "fileHash is required" },
            });
        }

        // Clean hash: remove 0x prefix if present
        const cleanHash = fileHash.replace(/^0x/, "").toLowerCase();
        if (!hashing.isValidHash(cleanHash)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_HASH",
                    message: "fileHash must be a 64-character hexadecimal string",
                },
            });
        }

        if (!metadata || !metadata.timestamp) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_FIELDS", message: "metadata.timestamp is required" },
            });
        }

        // Check for duplicate in local DB
        const existing = db.getByHash(cleanHash);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: {
                    code: "DUPLICATE_HASH",
                    message: "This evidence hash has already been anchored",
                    existing: {
                        evidenceId: existing.evidence_id,
                        anchoredAt: existing.anchored_at,
                    },
                },
            });
        }

        // Generate evidence ID
        const evidenceId = `EV-${new Date().getFullYear()}-${cleanHash.slice(0, 4).toUpperCase()}`;

        // Hash GPS coordinates for privacy
        const lat = metadata.latitude || 0;
        const lon = metadata.longitude || 0;
        const gpsHash = hashing.sha256String(`${lat.toFixed(6)},${lon.toFixed(6)}`);

        // Anchor to blockchain
        const txResult = await blockchain.anchorEvidence(
            cleanHash,
            gpsHash,
            Math.floor(new Date(metadata.timestamp).getTime() / 1000),
            evidenceId
        );

        const anchoredAt = new Date().toISOString();

        // Persist to SQLite
        db.insert({
            evidenceId,
            fileHash: cleanHash,
            transactionHash: txResult.transactionHash,
            blockNumber: txResult.blockNumber,
            anchoredAt,
            status: "anchored",
            latitude: lat,
            longitude: lon,
            captureTimestamp: metadata.timestamp,
            officerId: req.officer?.sub || metadata.officerId || "anonymous",
            deviceId: metadata.deviceId || "unknown",
            captureMode: metadata.captureMode || "photo",
            resolution: metadata.resolution || "unknown",
        });

        console.log(`✅ Evidence anchored: ${evidenceId} (block ${txResult.blockNumber})`);

        return res.status(201).json({
            success: true,
            data: {
                evidenceId,
                fileHash: cleanHash,
                transactionHash: txResult.transactionHash,
                blockNumber: txResult.blockNumber,
                anchoredAt,
                status: "anchored",
            },
        });
    } catch (err) {
        console.error("Submit error:", err.message);

        if (err.message.includes("already anchored")) {
            return res.status(409).json({
                success: false,
                error: { code: "DUPLICATE_HASH", message: "This evidence hash has already been anchored" },
            });
        }

        return res.status(500).json({
            success: false,
            error: { code: "INTERNAL_ERROR", message: err.message },
        });
    }
});

// ──────────────────────────────────────
// POST /api/evidence/upload
// Upload encrypted evidence file to storage
// ──────────────────────────────────────
router.post("/upload", authenticate, uploadLimiter, upload.single("encryptedFile"), async (req, res) => {
    try {
        const { evidenceId } = req.body;

        if (!evidenceId) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_FIELDS", message: "evidenceId is required" },
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: "NO_FILE", message: "encryptedFile is required" },
            });
        }

        // Find the record in DB
        const record = db.getById(evidenceId);
        if (!record) {
            return res.status(404).json({
                success: false,
                error: { code: "EVIDENCE_NOT_FOUND", message: `No evidence record found for ID: ${evidenceId}` },
            });
        }

        // Store file (mock IPFS)
        const result = await storage.store(req.file.buffer, req.file.originalname);

        // Link CID to blockchain record
        await blockchain.linkStorage(record.file_hash, result.cid);

        // Update DB
        db.linkStorage(evidenceId, result.cid, result.url);

        console.log(`📦 File uploaded for ${evidenceId}: ${result.cid}`);

        return res.status(200).json({
            success: true,
            data: {
                evidenceId,
                storageCid: result.cid,
                storageUrl: result.url,
                fileSizeBytes: req.file.size,
                uploadedAt: new Date().toISOString(),
            },
        });
    } catch (err) {
        console.error("Upload error:", err.message);
        return res.status(500).json({
            success: false,
            error: { code: "INTERNAL_ERROR", message: err.message },
        });
    }
});

// ──────────────────────────────────────
// POST /api/evidence/verify  (PUBLIC — no auth required)
// Verify a file against the blockchain
// ──────────────────────────────────────
router.post("/verify", verifyLimiter, upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: "NO_FILE", message: "A file must be provided for verification" },
            });
        }

        // Compute SHA-256 hash of the uploaded file
        const hash = hashing.sha256(req.file.buffer);

        console.log(`🔍 Verifying hash: ${hash.slice(0, 16)}...`);

        // Query blockchain
        const onChainRecord = await blockchain.verifyEvidence(hash);

        if (onChainRecord.exists) {
            // Look up local DB for extra metadata
            const localRecord = db.getByHash(hash);

            return res.status(200).json({
                success: true,
                verified: true,
                data: {
                    computedHash: hash,
                    match: true,
                    record: {
                        evidenceId: onChainRecord.evidenceId,
                        fileHash: hash,
                        transactionHash: localRecord?.transaction_hash || "on-chain",
                        blockNumber: localRecord?.block_number || 0,
                        anchoredAt: localRecord?.anchored_at || new Date(onChainRecord.timestamp * 1000).toISOString(),
                        metadata: {
                            timestamp: new Date(onChainRecord.timestamp * 1000).toISOString(),
                            officerId: localRecord?.officer_id || onChainRecord.officer,
                            captureMode: localRecord?.capture_mode || "photo",
                        },
                        officer: onChainRecord.officer,
                        ipfsCid: onChainRecord.ipfsCid,
                    },
                },
            });
        } else {
            return res.status(200).json({
                success: true,
                verified: false,
                data: {
                    computedHash: hash,
                    match: false,
                    record: null,
                    message: "No evidence record matches this file's hash. The file may have been altered or was never registered.",
                },
            });
        }
    } catch (err) {
        console.error("Verify error:", err.message);
        return res.status(500).json({
            success: false,
            error: { code: "INTERNAL_ERROR", message: err.message },
        });
    }
});

// ──────────────────────────────────────
// GET /api/evidence/:evidenceId
// Get a specific evidence record
// ──────────────────────────────────────
router.get("/:evidenceId", authenticate, generalLimiter, (req, res) => {
    const row = db.getById(req.params.evidenceId);
    if (!row) {
        return res.status(404).json({
            success: false,
            error: { code: "EVIDENCE_NOT_FOUND", message: `No record found for: ${req.params.evidenceId}` },
        });
    }

    return res.status(200).json({ success: true, data: db.rowToRecord(row) });
});

// ──────────────────────────────────────
// GET /api/evidence
// List all evidence records (paginated)
// ──────────────────────────────────────
router.get("/", authenticate, generalLimiter, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { officerId, status, from, to } = req.query;

    const result = db.list({ page, limit, officerId, status, from, to });

    return res.status(200).json({
        success: true,
        data: {
            records: result.records.map((r) => ({
                evidenceId: r.evidence_id,
                fileHash: r.file_hash,
                status: r.status,
                anchoredAt: r.anchored_at,
                officerId: r.officer_id,
            })),
            pagination: result.pagination,
        },
    });
});

module.exports = router;
