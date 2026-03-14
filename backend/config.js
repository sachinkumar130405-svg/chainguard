const path = require('path');

let deployData = {};
try {
  deployData = require('../contracts/deployment.json');
} catch (e) {
  try {
    deployData = require('./contracts/deployment.json');
  } catch (e2) { }
}

// Centralised configuration for the backend API.
// Reads from environment variables with sensible MVP defaults.

const env = process.env;

function boolEnv(name, fallback = false) {
  const v = env[name];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

module.exports = {
  env: env.NODE_ENV || 'development',

  // HTTP server
  port: Number(env.PORT) || 3001,
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',

  // Hardhat / Ethereum RPC
  chainRpcUrl: env.CHAIN_RPC_URL || env.RPC_URL || 'http://127.0.0.1:8545',
  // Contract address: priority is 1) CONTRACT_ADDRESS env, 2) deployment.json, 3) empty string
  contractAddress: (() => {
    const addr = env.CONTRACT_ADDRESS || deployData.address || '';
    if (!addr && (env.NODE_ENV === 'production' || env.MOCK_BLOCKCHAIN !== '1')) {
      console.warn(
        '[ChainGuard] WARNING: contractAddress is not set. ' +
        'Set CONTRACT_ADDRESS in your environment or run deploy.js to generate contracts/deployment.json.'
      );
    }
    return addr;
  })(),

  // Storage
  useMockStorage: boolEnv('USE_MOCK_STORAGE', true),
  pinata: {
    apiKey: env.PINATA_API_KEY || '',
    secretKey: env.PINATA_SECRET_KEY || '',
  },

  // JWT auth (MVP: symmetric HS256)
  jwt: {
    secret: env.JWT_SECRET || 'dev-only-secret-change-me',
    issuer: env.JWT_ISSUER || 'chainguard.local',
    audience: env.JWT_AUDIENCE || 'chainguard.officers',
    requiredRole: env.JWT_REQUIRED_ROLE || 'first_responder',
  },
  useMockAuth: boolEnv('USE_MOCK_AUTH', false),

  // SQLite
  sqlitePath:
    env.SQLITE_PATH ||
    path.join(__dirname, '..', 'data', 'chainguard.db'),

  // Rate limiting (per API contract)
  rateLimits: {
    submitPerMin: Number(env.RL_SUBMIT_PER_MIN) || 30,
    uploadPerMin: Number(env.RL_UPLOAD_PER_MIN) || 10,
    verifyPerMin: Number(env.RL_VERIFY_PER_MIN) || 60,
    listPerMin: Number(env.RL_LIST_PER_MIN) || 120,
  },

  // Misc toggles
  enableRequestLogging: boolEnv('ENABLE_REQUEST_LOGGING', true),
};

