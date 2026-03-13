const crypto = require('crypto');

// Server-side SHA-256 hashing service used by the /verify endpoint.

function hashBuffer(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

function hashStream(readable) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');

    readable.on('data', (chunk) => hash.update(chunk));
    readable.on('end', () => {
      try {
        const digest = hash.digest('hex');
        resolve(digest);
      } catch (err) {
        reject(err);
      }
    });
    readable.on('error', reject);
  });
}

module.exports = {
  hashBuffer,
  hashStream,
};

