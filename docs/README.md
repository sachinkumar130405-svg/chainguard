<p align="center">
  <img src="docs/assets/chainguard-logo.svg" alt="ChainGuard Logo" width="120" />
</p>

<h1 align="center">ChainGuard</h1>
<h3 align="center">Lens to Ledger — Tamper-Proof Digital Evidence for First Responders</h3>

<p align="center">
  <img src="https://img.shields.io/badge/status-MVP-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img src="https://img.shields.io/badge/blockchain-Ethereum-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/storage-IPFS-teal?style=flat-square" />
</p>

## 🌐 Live Deployments
- **Verification Dashboard**: [Vercel Deployment](https://chainguard.vercel.app)
- **Capture PWA**: [PWA App Link](https://chainguard.vercel.app/capture/)
- **API Backend**: [Railway App](https://chainguard-backend.up.railway.app) (Example)

---

## 🔍 The Problem

Digital evidence captured by first responders — photos, videos, audio — is routinely challenged in court. Defence attorneys question **when** a photo was taken, **where** it was captured, **who** captured it, and crucially, **whether the file has been altered** since capture. The current chain-of-custody process relies on manual logs and trust, leaving a wide gap for reasonable doubt.

## 💡 The Solution

**ChainGuard** creates an unbroken, cryptographically verifiable chain of custody from the moment an officer's shutter fires to the moment a judge reviews the evidence in court.

### The "Lens to Ledger" Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  📸 CAPTURE  │───▶│  #️⃣ HASH     │───▶│  📦 BUNDLE   │───▶│  ⛓️ ANCHOR   │
│  Sandboxed   │    │  SHA-256 of  │    │  Hash + GPS  │    │  Write hash  │
│  Camera      │    │  raw pixels  │    │  + timestamp │    │  to smart    │
│  (no roll)   │    │  instantly   │    │  + officer   │    │  contract    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
                                        ┌──────────────┐            │
                                        │  🔒 STORE    │◀───────────┘
                                        │  Encrypted   │
                                        │  media to    │
                                        │  IPFS / S3   │
                                        └──────────────┘
                                                │
                                        ┌──────────────┐
                                        │  ✅ VERIFY   │
                                        │  Dashboard   │
                                        │  for legal   │
                                        │  review      │
                                        └──────────────┘
```

---

## ✨ Core Features

| Feature | Description |
|---|---|
| **Sandboxed Camera** | Internal camera interface — no gallery uploads, eliminating pre-manipulation. |
| **Instant Hashing** | SHA-256 hash generated from raw image data the instant the shutter fires. |
| **Metadata Bundling** | Hash bundled with GPS coordinates, NTP-synced timestamp, and verified officer ID. |
| **Blockchain Anchoring** | Only the hash + metadata are written to an Ethereum smart contract — no PII on-chain. |
| **Encrypted Storage** | The actual media file is AES-256 encrypted and uploaded to IPFS via Pinata. |
| **Verification Dashboard** | Web portal for judges & lawyers to drag-drop evidence and verify it against the blockchain record. |
| **Capture PWA** | A mobile-responsive web application that forces an on-device secure capture flow with instant hashing. |

---

## 🚀 Stretch Goals (Architecture-Ready)

- **Offline Caching** — Queue hashes locally when connectivity drops; auto-sync when back online.
- **Zero-Knowledge Proofs** — Prove an evidence was captured within a jurisdiction without revealing exact GPS.
- **Hardware Attestation** — Leverage Secure Enclave (iOS) / Titan M (Android) to attest device integrity.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend (Dashboard) | Vite + Vanilla JS, CSS3 (dark cyberpunk theme) |
| Frontend (Capture PWA) | React / PWA with MediaDevices API |
| Backend API | Node.js + Express |
| Blockchain | Solidity smart contracts on Ethereum (Hardhat dev chain) |
| Storage | IPFS (Pinata gateway) or mocked secure server |
| Hashing | Web Crypto API (SubtleCrypto.digest) |
| Database | SQLite (evidence index + officer registry) |

---

## 📂 Project Structure

```
chainguard/
├── frontend/               # Verification Dashboard (Vite)
│   ├── index.html
│   ├── style.css
│   └── main.js
├── backend/                # Express API server
│   ├── server.js
│   ├── routes/
│   └── services/
├── contracts/              # Solidity smart contracts
│   ├── EvidenceRegistry.sol
│   └── hardhat.config.js
├── docs/                   # Architecture & API docs
│   ├── ARCHITECTURE.md
│   └── APICONTRACT.md
├── README.md
└── package.json
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Git**

### 1. Clone & Install

```bash
git clone https://github.com/your-org/chainguard.git
cd chainguard
npm install
```

### 2. Environment Variables

Create `.env` at the project root:
```bash
cp .env.example .env
```
Edit `.env` with your deployment variables:
- `RPC_URL`: Your Sepolia endpoint.
- `PRIVATE_KEY`: Deployment wallet key.
- `PINATA_API_KEY` & `PINATA_SECRET_KEY`: For IPFS uploads.
- `JWT_SECRET`: For officer authentication.

### 3. Start the Development Blockchain

```bash
cd contracts
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

### 3. Start the Backend

```bash
cd backend
npm run dev
# → API running on http://localhost:3001
```

### 4. Start the Verification Dashboard

```bash
cd frontend
npx vite
# → Dashboard running on http://localhost:5173
```

### 5. Open the Dashboard

Navigate to `http://localhost:5173` — drag and drop any image to hash and verify it against the ledger.

---

## 🔐 Security Model

1. **Evidence never leaves the device unencrypted.** AES-256-GCM encryption occurs before any network transmission.
2. **No PII on-chain.** The smart contract stores only the SHA-256 hash, a timestamp, GPS hash, and an officer ID reference.
3. **Immutable audit trail.** Once anchored, a record cannot be altered or deleted from the blockchain.
4. **Client-side hashing.** The hash is computed in the browser/app before any server contact, preventing man-in-the-middle tampering.

---

## 📄 License

MIT — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>ChainGuard</strong> — Because evidence integrity starts at the shutter.
</p>
