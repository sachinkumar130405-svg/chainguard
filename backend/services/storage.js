const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

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
 * Real IPFS storage via Pinata SDK.
 */
async function storeToIPFS(fileBuffer, { evidenceId, iv, mimeType }) {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY || process.env.PINATA_SECRET;

  if (!apiKey || !secretKey) {
    throw new Error('IPFS storage failed: PINATA_API_KEY or PINATA_SECRET environment variable is missing.');
  }

  // Require inside the function or file scope
  const pinataSDK = require('@pinata/sdk');
  const pinata = new pinataSDK(apiKey, secretKey);

  const options = {
    pinataMetadata: {
      name: `chainguard_${evidenceId}`,
      keyvalues: { evidenceId, iv }
    },
    pinataOptions: {
      cidVersion: 1
    }
  };

  const maxRetries = 3;
  let attempt = 0;

  // Pinata SDK requires a readable stream
  const { Readable } = require('stream');

  while (attempt < maxRetries) {
    try {
      attempt++;

      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);
      stream.path = `${evidenceId}.enc`;

      const res = await pinata.pinFileToIPFS(stream, options);

      const storageCid = res.IpfsHash;
      const storageUrl = `https://gateway.pinata.cloud/ipfs/${storageCid}`;

      console.log(`[STORAGE] IPFS storage: pinned file ${evidenceId} to ${storageCid}`);

      return {
        evidenceId,
        storageCid,
        storageUrl,
        fileSizeBytes: res.PinSize,
        uploadedAt: new Date().toISOString(),
        iv,
        mimeType,
      };
    } catch (err) {
      console.error(`[STORAGE] IPFS pinning failed on attempt ${attempt}:`, err.message || err);
      if (attempt >= maxRetries) {
        throw new Error(`IPFS storage failed after ${maxRetries} attempts: ${err.message || err}`);
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

module.exports = {
  storeEncryptedFile,
};

