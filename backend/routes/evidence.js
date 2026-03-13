const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const { createPerMinuteLimiter } = require('../middleware/rateLimiter');
const config = require('../config');
const db = require('../db');
const blockchain = require('../services/blockchain');
const storage = require('../services/storage');
const hashing = require('../services/hashing');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

function isValidHex64(str) {
  return typeof str === 'string' && /^[0-9a-fA-F]{64}$/.test(str);
}

function badRequest(res, code, message) {
  return res.status(400).json({
    success: false,
    error: { code, message },
  });
}

// POST /api/evidence/submit
router.post(
  '/submit',
  auth,
  createPerMinuteLimiter(config.rateLimits.submitPerMin),
  async (req, res) => {
    const { fileHash, metadata } = req.body || {};

    if (!isValidHex64(fileHash)) {
      return badRequest(
        res,
        'INVALID_HASH',
        'fileHash must be a 64-character hexadecimal string',
      );
    }

    if (!metadata || typeof metadata !== 'object') {
      return badRequest(
        res,
        'MISSING_FIELDS',
        'metadata object is required',
      );
    }

    const evidenceId = `ev_${fileHash.slice(0, 8)}`;

    const existing = db.getEvidenceById(evidenceId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_HASH',
          message: 'This evidence hash has already been anchored',
          existing: {
            evidenceId: existing.evidenceId,
            anchoredAt: existing.anchoredAt,
          },
        },
      });
    }

    try {
      const officerId =
        metadata.officerId || req.user?.badge || req.user?.sub || 'unknown';

      const chainRecord = await blockchain.anchorEvidence({
        fileHash,
        metadata,
        officerId,
      });

      const record = {
        evidenceId,
        fileHash,
        transactionHash: chainRecord.transactionHash,
        blockNumber: chainRecord.blockNumber,
        anchoredAt: chainRecord.anchoredAt,
        officerId,
        status: 'anchored',
        metadata,
      };

      db.upsertEvidence(record);

      return res.status(201).json({
        success: true,
        data: {
          evidenceId: record.evidenceId,
          fileHash: record.fileHash,
          transactionHash: record.transactionHash,
          blockNumber: record.blockNumber,
          anchoredAt: record.anchoredAt,
          status: record.status,
        },
      });
    } catch (err) {
      console.error('submit error', err);
      return res.status(503).json({
        success: false,
        error: {
          code: 'BLOCKCHAIN_UNAVAILABLE',
          message: 'Cannot reach chain',
        },
      });
    }
  },
);

// POST /api/evidence/upload
router.post(
  '/upload',
  auth,
  createPerMinuteLimiter(config.rateLimits.uploadPerMin),
  upload.single('encryptedFile'),
  async (req, res) => {
    const { evidenceId, iv, mimeType } = req.body || {};
    const file = req.file;

    if (!evidenceId || !file || !iv || !mimeType) {
      return badRequest(
        res,
        'MISSING_FIELDS',
        'evidenceId, encryptedFile, iv, and mimeType are required',
      );
    }

    const existing = db.getEvidenceById(evidenceId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence record found for ID: ${evidenceId}`,
        },
      });
    }

    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Encrypted file exceeds maximum size of 50 MB',
        },
      });
    }

    try {
      const stored = await storage.storeEncryptedFile(file.buffer, {
        evidenceId,
        iv,
        mimeType,
      });

      db.updateStorageInfo(evidenceId, {
        storageCid: stored.storageCid,
        fileSizeBytes: stored.fileSizeBytes,
      });

      await blockchain.linkStorage({
        fileHash: existing.fileHash,
        storageCid: stored.storageCid,
      });

      return res.json({
        success: true,
        data: {
          evidenceId: stored.evidenceId,
          storageCid: stored.storageCid,
          storageUrl: stored.storageUrl,
          fileSizeBytes: stored.fileSizeBytes,
          uploadedAt: stored.uploadedAt,
        },
      });
    } catch (err) {
      console.error('upload error', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to store file' },
      });
    }
  },
);

// POST /api/evidence/verify (public, no auth)
router.post(
  '/verify',
  createPerMinuteLimiter(config.rateLimits.verifyPerMin),
  upload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return badRequest(res, 'NO_FILE', 'A file must be provided for verification');
    }

    try {
      const computedHash = hashing.hashBuffer(file.buffer);
      const { match, record } = await blockchain.verifyEvidence(computedHash);

      if (!match || !record) {
        return res.json({
          success: true,
          verified: false,
          data: {
            computedHash,
            match: false,
            record: null,
            message:
              "No evidence record matches this file's hash. The file may have been altered or was never registered.",
          },
        });
      }

      const dbRecord = db.getEvidenceById(
        record.evidenceId || `ev_${computedHash.slice(0, 8)}`,
      );

      const responseRecord = dbRecord || {
        evidenceId: record.evidenceId || `ev_${computedHash.slice(0, 8)}`,
        fileHash: computedHash,
        transactionHash: record.transactionHash,
        blockNumber: record.blockNumber,
        anchoredAt: record.anchoredAt,
        metadata: record.metadata,
      };

      return res.json({
        success: true,
        verified: true,
        data: {
          computedHash,
          match: true,
          record: {
            evidenceId: responseRecord.evidenceId,
            fileHash: responseRecord.fileHash,
            transactionHash: responseRecord.transactionHash,
            blockNumber: responseRecord.blockNumber,
            anchoredAt: responseRecord.anchoredAt,
            metadata: responseRecord.metadata,
          },
        },
      });
    } catch (err) {
      console.error('verify error', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Verification failed' },
      });
    }
  },
);

// GET /api/evidence/:evidenceId
router.get('/:evidenceId', auth, async (req, res) => {
  const { evidenceId } = req.params;
  const record = db.getEvidenceById(evidenceId);
  if (!record) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'EVIDENCE_NOT_FOUND',
        message: `No evidence record found for ID: ${evidenceId}`,
      },
    });
  }

  return res.json({
    success: true,
    data: record,
  });
});

// GET /api/evidence
router.get(
  '/',
  auth,
  createPerMinuteLimiter(config.rateLimits.listPerMin),
  (req, res) => {
    const { page, limit, officerId, status, from, to } = req.query;
    const result = db.listEvidence({
      page,
      limit,
      officerId,
      status,
      from,
      to,
    });

    return res.json({
      success: true,
      data: result,
    });
  },
);

module.exports = router;

