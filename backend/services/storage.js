const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock storage service that writes encrypted files to disk and
// returns an IPFS-like CID and public URL.

const STORAGE_ROOT = path.join(__dirname, '..', 'storage');

function ensureStorageRoot() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
}

async function storeEncryptedFile(fileBuffer, { evidenceId, iv, mimeType }) {
  ensureStorageRoot();

  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  const cid = hash.digest('hex'); // not real IPFS, but deterministic

  const fileName = `${cid}.bin`;
  const filePath = path.join(STORAGE_ROOT, fileName);

  await fs.promises.writeFile(filePath, fileBuffer);

  const stats = await fs.promises.stat(filePath);

  // In real deployment, this would be an IPFS gateway URL
  const storageUrl = `https://gateway.example.invalid/ipfs/${cid}`;

  return {
    evidenceId,
    storageCid: cid,
    storageUrl,
    fileSizeBytes: stats.size,
    uploadedAt: new Date().toISOString(),
    iv,
    mimeType,
  };
}

module.exports = {
  storeEncryptedFile,
};

