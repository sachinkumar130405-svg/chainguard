const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db;

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getDb() {
  if (db) return db;

  ensureDirExists(config.sqlitePath);
  db = new Database(config.sqlitePath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      evidence_id     TEXT PRIMARY KEY,
      file_hash       TEXT NOT NULL,
      transaction_hash TEXT NOT NULL,
      block_number    INTEGER NOT NULL,
      anchored_at     TEXT NOT NULL,
      officer_id      TEXT NOT NULL,
      status          TEXT NOT NULL,
      storage_cid     TEXT,
      file_size_bytes INTEGER,
      metadata_json   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_officer
      ON evidence (officer_id);

    CREATE INDEX IF NOT EXISTS idx_evidence_status
      ON evidence (status);

    CREATE INDEX IF NOT EXISTS idx_evidence_anchored_at
      ON evidence (anchored_at);
  `);

  return db;
}

function upsertEvidence(record) {
  const database = getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO evidence (
      evidence_id, file_hash, transaction_hash, block_number,
      anchored_at, officer_id, status, storage_cid,
      file_size_bytes, metadata_json, created_at, updated_at
    )
    VALUES (@evidence_id, @file_hash, @transaction_hash, @block_number,
            @anchored_at, @officer_id, @status, @storage_cid,
            @file_size_bytes, @metadata_json, @created_at, @updated_at)
    ON CONFLICT(evidence_id) DO UPDATE SET
      file_hash       = excluded.file_hash,
      transaction_hash = excluded.transaction_hash,
      block_number    = excluded.block_number,
      anchored_at     = excluded.anchored_at,
      officer_id      = excluded.officer_id,
      status          = excluded.status,
      storage_cid     = excluded.storage_cid,
      file_size_bytes = excluded.file_size_bytes,
      metadata_json   = excluded.metadata_json,
      updated_at      = excluded.updated_at;
  `);

  const payload = {
    evidence_id: record.evidenceId,
    file_hash: record.fileHash,
    transaction_hash: record.transactionHash,
    block_number: record.blockNumber,
    anchored_at: record.anchoredAt,
    officer_id: record.officerId,
    status: record.status || 'anchored',
    storage_cid: record.storageCid || null,
    file_size_bytes: record.fileSizeBytes || null,
    metadata_json: record.metadata ? JSON.stringify(record.metadata) : null,
    created_at: record.createdAt || now,
    updated_at: now,
  };

  stmt.run(payload);
}

function updateStorageInfo(evidenceId, { storageCid, fileSizeBytes }) {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE evidence
    SET storage_cid = @storage_cid,
        file_size_bytes = @file_size_bytes,
        updated_at = @updated_at
    WHERE evidence_id = @evidence_id;
  `);
  stmt.run({
    evidence_id: evidenceId,
    storage_cid: storageCid,
    file_size_bytes: fileSizeBytes,
    updated_at: new Date().toISOString(),
  });
}

function getEvidenceById(evidenceId) {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM evidence WHERE evidence_id = ?')
    .get(evidenceId);
  if (!row) return null;
  return rowToDomain(row);
}

function listEvidence({ page = 1, limit = 20, officerId, status, from, to }) {
  const database = getDb();

  const where = [];
  const params = {};

  if (officerId) {
    where.push('officer_id = @officer_id');
    params.officer_id = officerId;
  }
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (from) {
    where.push('anchored_at >= @from');
    params.from = from;
  }
  if (to) {
    where.push('anchored_at <= @to');
    params.to = to;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalStmt = database.prepare(
    `SELECT COUNT(*) as total FROM evidence ${whereSql};`,
  );
  const { total } = totalStmt.get(params);

  const pageNumber = Math.max(1, Number(page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNumber - 1) * perPage;

  const rowsStmt = database.prepare(
    `
      SELECT * FROM evidence
      ${whereSql}
      ORDER BY datetime(anchored_at) DESC
      LIMIT @limit OFFSET @offset;
    `,
  );

  const rows = rowsStmt.all({ ...params, limit: perPage, offset });

  return {
    records: rows.map(rowToSummary),
    pagination: {
      page: pageNumber,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 1,
    },
  };
}

function rowToDomain(row) {
  return {
    evidenceId: row.evidence_id,
    fileHash: row.file_hash,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    anchoredAt: row.anchored_at,
    officerId: row.officer_id,
    status: row.status,
    storageCid: row.storage_cid || undefined,
    fileSizeBytes: row.file_size_bytes || undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSummary(row) {
  return {
    evidenceId: row.evidence_id,
    fileHash: row.file_hash,
    status: row.status,
    anchoredAt: row.anchored_at,
    officerId: row.officer_id,
  };
}

module.exports = {
  getDb,
  upsertEvidence,
  updateStorageInfo,
  getEvidenceById,
  listEvidence,
};

