/**
 * Database Module — JSON-file persistence for evidence records.
 *
 * Zero native dependencies. Stores records in a JSON file on disk
 * and keeps an in-memory copy for fast lookups.
 * Drop-in replacement; swap to better-sqlite3/sql.js when build tools are available.
 */
const fs = require("fs");
const path = require("path");
const config = require("../config");

// Use .json extension instead of .db
const DB_PATH = config.db.path.replace(/\.db$/, ".json");

// ──── In-memory store ────
let records = [];

// ──── Persistence helpers ────

function load() {
    try {
        if (fs.existsSync(DB_PATH)) {
            records = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        }
    } catch (_) {
        records = [];
    }
}

function save() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2));
}

// Load existing data on startup
load();

// ──── Helpers ────

/**
 * Convert a snake_case DB row to the camelCase API format.
 */
function rowToRecord(row) {
    if (!row) return null;
    return {
        evidenceId: row.evidence_id,
        fileHash: row.file_hash,
        transactionHash: row.transaction_hash,
        blockNumber: row.block_number,
        anchoredAt: row.anchored_at,
        status: row.status,
        storageCid: row.storage_cid || undefined,
        storageUrl: row.storage_url || undefined,
        metadata: {
            latitude: row.latitude,
            longitude: row.longitude,
            timestamp: row.capture_timestamp,
            deviceId: row.device_id,
            officerId: row.officer_id,
            captureMode: row.capture_mode,
            resolution: row.resolution,
        },
    };
}

// ──── Public API ────

function insert(record) {
    records.push({
        evidence_id: record.evidenceId,
        file_hash: record.fileHash,
        transaction_hash: record.transactionHash,
        block_number: record.blockNumber,
        anchored_at: record.anchoredAt,
        status: record.status || "anchored",
        storage_cid: null,
        storage_url: null,
        latitude: record.latitude,
        longitude: record.longitude,
        capture_timestamp: record.captureTimestamp,
        officer_id: record.officerId,
        device_id: record.deviceId,
        capture_mode: record.captureMode || "photo",
        resolution: record.resolution,
        created_at: new Date().toISOString(),
    });
    save();
}

function getByHash(fileHash) {
    return records.find((r) => r.file_hash === fileHash) || null;
}

function getById(evidenceId) {
    return records.find((r) => r.evidence_id === evidenceId) || null;
}

function linkStorage(evidenceId, cid, url) {
    const rec = records.find((r) => r.evidence_id === evidenceId);
    if (rec) {
        rec.storage_cid = cid;
        rec.storage_url = url;
        save();
    }
}

/**
 * Paginated listing with optional filters.
 */
function list({ page = 1, limit = 20, officerId, status, from, to } = {}) {
    let filtered = records;

    if (officerId) filtered = filtered.filter((r) => r.officer_id === officerId);
    if (status)    filtered = filtered.filter((r) => r.status === status);
    if (from)      filtered = filtered.filter((r) => r.anchored_at >= from);
    if (to)        filtered = filtered.filter((r) => r.anchored_at <= to);

    // Sort by anchored_at descending
    filtered = [...filtered].sort((a, b) => b.anchored_at.localeCompare(a.anchored_at));

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    return {
        records: paged,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        },
    };
}

function close() {
    save();
}

module.exports = { insert, getByHash, getById, linkStorage, list, close, rowToRecord };
