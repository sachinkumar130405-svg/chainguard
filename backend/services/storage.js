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

// Storage service configuration.
// By default, uses local disk mock. Set USE_MOCK_STORAGE=0 and provide Pinata keys for real IPFS.

async function storeEncryptedFile(fileBuffer, { evidenceId, iv, mimeType }) {
  if (config.useMockStorage) {
    return await storeToDisk(fileBuffer, { evidenceId, iv, mimeType });
  } else {
    return await storeToIPFS(fileBuffer, { evidenceId, iv, mimeType });
  }
}

async function storeToDisk(fileBuffer, { evidenceId, iv, mimeType }) {
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

  console.log(`[STORAGE] Mock storage: stored file ${evidenceId} to ${filePath}`);

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

/**
 * Placeholder for real IPFS storage via Pinata.
 * To implement: Use @pinata/sdk or axios to POST to https://api.pinata.cloud/pinning/pinFileToIPFS
 */
async function storeToIPFS(fileBuffer, { evidenceId, iv, mimeType }) {
  console.warn('[STORAGE] Real IPFS storage requested but only stubbed. Check Pinata config.');
  throw new Error('IPFS storage not fully implemented. Provide PINATA_API_KEY.');
}

module.exports = {
  storeEncryptedFile,
};

