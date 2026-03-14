# ChainGuard Deployment Guide

This document outlines the infrastructure mapping and deployment strategy for the ChainGuard MVP.

## Infrastructure Mapping

| Component | Service Provider | Environment / Details |
| :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Static PWA hosting with Edge acceleration. |
| **Backend** | [Railway](https://railway.app) | Containerized Node.js API with SQLite persistent volume. |
| **Smart Contracts** | [Ethereum Sepolia](https://sepolia.etherscan.io) | Public testnet for immutable evidence anchoring. |
| **Storage** | [Pinata (IPFS)](https://www.pinata.cloud) | Decentralized storage for encrypted evidence payloads. |

## Environment Configuration

Before deploying, ensure all variables in `.env.example` are populated in your CI/CD provider or platform settings.

### Backend Environment Variables (Railway)

| Variable | Description | Example Value | Required? |
| :--- | :--- | :--- | :--- |
| `PORT` | The port the Express server listens on. | `3000` | Mandatory |
| `NODE_ENV` | Deployment environment. | `production` | Recommended |
| `JWT_SECRET` | Secret key for signing and verifying JWT tokens. | `super-secret-key-123` | Mandatory |
| `RPC_URL` | Sepolia provider RPC URL (Alchemy/Infura). | `https://eth-sepolia.g.alchemy.com/v2/...` | Mandatory (Live) |
| `PRIVATE_KEY` | Private key of the deployer/officer wallet. | `0x...` | Mandatory (Live) |
| `CONTRACT_ADDRESS` | Deployed `EvidenceRegistry` contract address. | `0x1151473B276897648DfcF94713DA490C4e4fC782` | Mandatory |
| `PINATA_API_KEY` | Pinata API Key for IPFS storage. | `your_pinata_key` | Optional (Mock) |
| `PINATA_SECRET` | Pinata API Secret for IPFS storage. | `your_pinata_secret` | Optional (Mock) |
| `CORS_ORIGIN` | Allowed origin for CORS requests (Frontend URL). | `https://chainguard.vercel.app` | Mandatory |
| `USE_MOCK_STORAGE` | Toggle IPFS storage (set to `0` for real Pinata). | `1` | Optional |
| `USE_MOCK_AUTH` | Toggle Auth (set to `false` for real JWT). | `false` | Optional |
| `SQLITE_PATH` | Path to the SQLite database file. | `/app/backend/data/chainguard.db` | Mandatory |
| `RATE_LIMIT_WINDOW` | Time window for rate limiting (ms). | `60000` | Optional |
| `RATE_LIMIT_MAX` | Max requests per window per IP. | `100` | Optional |

### Frontend Environment Variables (Vercel)

| Variable | Description | Example Value | Required? |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Railway backend API URL. | `https://chainguard-backend.up.railway.app` | Mandatory |
| `VITE_CONTRACT_ADDRESS`| Deployed Sepolia contract address. | `0x1151473B...` | Mandatory |
| `VITE_CHAIN_ID` | Sepolia chain ID (`11155111`). | `11155111` | Optional |
| `VITE_PINATA_GATEWAY` | Public IPFS gateway for viewing evidence. | `https://gateway.pinata.cloud` | Optional |

## Deployment Steps

### 1. Smart Contracts (Sepolia)
1. Ensure `RPC_URL` and `PRIVATE_KEY` are set in `.env`.
2. Deploy the contract:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```
3. Copy the resulting contract address for use in backend and frontend config.

### 2. Backend (Railway)
1. **Connect Repository**: Sign in to [Railway](https://railway.app) and create a new project from your GitHub repo.
2. **Set Variables**: In the "Variables" tab, add all variables from the "Backend Environment Variables" table above.
3. **Persistent Volume**:
   - Go to "Settings" > "Volumes".
   - Create a volume and mount it at `/app/backend/data/`.
   - Ensure `SQLITE_PATH` matches this mount point.
4. **Deploy**: Railway will automatically deploy on the next commit (or click "Deploy" manually).
5. **Verify**: Check the `/api/health` endpoint to ensure the service is running.

### 3. Frontend (Vercel)
1. **Connect Repository**: Sign in to [Vercel](https://vercel.com) and import your GitHub repo.
2. **Framework Preset**: Vercel should automatically detect "Vite".
3. **Configure Project**:
   - **Root Directory**: Select `frontend` (if prompted, otherwise Ensure `frontend` is the focused workspace).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**: Add all variables from the "Frontend Environment Variables" table. Use the "Add" button for each.
5. **Deploy**: Click "Deploy".
6. **Verify PWA**:
   - Once deployed, visit the URL on a mobile device.
   - Navigate to the `/capture` path.
   - You should see an "Add to Home Screen" prompt or be able to install it via browser settings.
    - Test offline capabilities by tethering or using airplane mode.

## Production Smoke Test Checklist

After deploying both the backend and frontend, walk through every item below to confirm the full pipeline is operational. Replace `<RAILWAY_URL>` and `<VERCEL_URL>` with your actual deployment URLs.

### 1. Backend Health
- [ ] `curl <RAILWAY_URL>/api/health` returns **HTTP 200** with `{ "status": "ok", "version": "…", "timestamp": "…" }`.

### 2. Frontend Dashboard
- [ ] Open `<VERCEL_URL>` in Chrome — page loads without console errors.
- [ ] The Verification Dashboard UI renders (drag-and-drop zone visible).

### 3. Capture PWA
- [ ] Navigate to `<VERCEL_URL>/capture/`.
- [ ] The browser prompts for **camera permission**.
- [ ] On mobile, the "Add to Home Screen" / install prompt appears (or is available via the browser menu).

### 4. Evidence Submission (Happy Path)
- [ ] In the Capture PWA, log in with valid credentials.
- [ ] Capture a photo — the app hashes and submits it.
- [ ] Confirm the result overlay shows a **transaction hash**.
- [ ] Open `https://sepolia.etherscan.io/tx/<txHash>` and verify the transaction is **confirmed**.

### 5. Verification Round-Trip
- [ ] Save or re-take the exact same photo file.
- [ ] Go to `<VERCEL_URL>` (Dashboard).
- [ ] Drag the file into the verification zone.
- [ ] Confirm the UI shows **"Evidence Verified"** with matching evidence ID, block number, and officer info.

### 6. Offline / Sync Flow
- [ ] On a mobile device running the installed Capture PWA, **turn off WiFi / go to airplane mode**.
- [ ] Capture another photo — the app should queue it locally (IndexedDB).
- [ ] **Re-enable WiFi**.
- [ ] Confirm the queued evidence syncs automatically and a transaction hash appears.

### 7. Railway Logs
- [ ] Open the Railway dashboard → select the backend service → **Logs**.
- [ ] Confirm there are no `ERROR` or `WARN` entries related to the above flow.
- [ ] Look for successful `POST /api/evidence/submit` and `POST /api/evidence/upload` entries.

### 8. Automated Smoke Script
Run the automated checks from the project root:
```bash
RAILWAY_URL=https://your-app.up.railway.app \
VERCEL_URL=https://your-app.vercel.app \
npx mocha backend/test/smoke.test.js --timeout 15000
```
