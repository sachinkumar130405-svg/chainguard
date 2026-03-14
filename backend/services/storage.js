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
 * Real IPFS storage via Pinata API.
 */
async function storeToIPFS(fileBuffer, { evidenceId, iv, mimeType }) {
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    throw new Error('IPFS storage failed: PINATA_JWT environment variable is missing.');
  }

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, `${evidenceId}.enc`);

  const metadata = JSON.stringify({
    name: `chainguard_${evidenceId}`,
    keyvalues: { evidenceId, iv }
  });
  formData.append('pinataMetadata', metadata);

  const options = JSON.stringify({ cidVersion: 1 });
  formData.append('pinataOptions', options);

  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJwt}`
      },
      body: formData
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Pinata API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const storageCid = data.IpfsHash;
    const storageUrl = `https://gateway.pinata.cloud/ipfs/${storageCid}`;

    console.log(`[STORAGE] IPFS storage: pinned file ${evidenceId} to ${storageCid}`);

    return {
      evidenceId,
      storageCid,
      storageUrl,
      fileSizeBytes: data.PinSize,
      uploadedAt: new Date().toISOString(),
      iv,
      mimeType,
    };
  } catch (err) {
    console.error('[STORAGE] IPFS pinning failed:', err);
    throw err;
  }
}

module.exports = {
  storeEncryptedFile,
};

