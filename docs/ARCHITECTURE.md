# ChainGuard — Architecture Document

> **Version:** 1.0 (MVP)
> **Last Updated:** 2026-03-13

---

## 1. Tech Stack Decision Matrix

| Concern | Choice | Rationale |
|---|---|---|
| **Dashboard Frontend** | Vite + Vanilla JS/CSS | Zero framework overhead, instant HMR, fast hackathon iteration |
| **Capture PWA** | Vanilla JS + PWA | MediaDevices API + Service Worker for offline caching and secure capture |
| **Backend API** | Node.js + Express | Fast to scaffold, JS everywhere, massive ecosystem |
| **Blockchain** | Solidity + Hardhat + Sepolia | Industry standard, deployed to Sepolia testnet for public verification |
| **Decentralized Storage** | IPFS via Pinata | Content-addressable, immutable, production-ready gateway |
| **Client Hashing** | Web Crypto API (`SubtleCrypto`) | Native browser API — no dependencies, hardware-accelerated |
| **Encryption** | AES-256-GCM (Web Crypto) | NIST-approved, authenticated encryption, built into browsers |
| **Database** | SQLite (better-sqlite3) | Embedded, zero-config, great for MVP indexing |
| **Testing** | Vitest + Hardhat Tests | Fast, native ESM support |

---

## 2. End-to-End Data Flow

```
                        ┌─────────────────────────────────────────────────┐
                        │                FIRST RESPONDER DEVICE           │
                        │                                                 │
                        │  ┌───────────┐   ┌──────────────┐              │
                        │  │ Sandboxed │──▶│ Raw Image    │              │
                        │  │ Camera    │   │ Buffer       │              │
                        │  └───────────┘   └──────┬───────┘              │
                        │                         │                       │
                        │                    ┌────▼────┐                  │
                        │                    │ SHA-256 │  ← Web Crypto   │
                        │                    │ Hash    │    (instant)     │
                        │                    └────┬────┘                  │
                        │                         │                       │
                        │        ┌────────────────┼────────────────┐      │
                        │        │                │                │      │
                        │   ┌────▼────┐     ┌────▼────┐    ┌─────▼────┐ │
                        │   │ GPS     │     │ NTP     │    │ Officer  │ │
                        │   │ Coords  │     │ Synced  │    │ ID       │ │
                        │   │         │     │ Time    │    │ (JWT)    │ │
                        │   └────┬────┘     └────┬────┘    └─────┬────┘ │
                        │        └────────┬──────┘───────────────┘      │
                        │                 │                              │
                        │          ┌──────▼──────┐                       │
                        │          │  METADATA   │                       │
                        │          │  BUNDLE     │                       │
                        │          │  (JSON)     │                       │
                        │          └──────┬──────┘                       │
                        │                 │                              │
                        │    ┌────────────┴────────────┐                 │
                        │    │                         │                 │
                        │    │  Offline?               │                 │
                        │    │  → Queue in IndexedDB   │                 │
                        │    │  Online?                │                 │
                        │    │  → Send immediately     │                 │
                        │    └────────────┬────────────┘                 │
                        └─────────────────┼─────────────────────────────┘
                                          │
                        ══════════════════╪═══════════════════ NETWORK
                                          │
                        ┌─────────────────▼─────────────────────────────┐
                        │              BACKEND API (Express)            │
                        │                                               │
                        │  POST /api/evidence/submit                    │
                        │  ┌─────────────────────────────────────────┐  │
                        │  │ 1. Validate JWT (officer identity)      │  │
                        │  │ 2. Validate hash format (hex, 64 chars) │  │
                        │  │ 3. Store metadata in SQLite index       │  │
                        │  │ 4. Call smart contract → anchorEvidence │  │
                        │  │ 5. Return transaction hash              │  │
                        │  └─────────────────────────────────────────┘  │
                        │                                               │
                        │  POST /api/evidence/upload                    │
                        │  ┌─────────────────────────────────────────┐  │
                        │  │ 1. Receive AES-256-GCM encrypted blob   │  │
                        │  │ 2. Pin to IPFS (or mock storage)        │  │
                        │  │ 3. Return IPFS CID                      │  │
                        │  └─────────────────────────────────────────┘  │
                        │                                               │
                        │  POST /api/evidence/verify                    │
                        │  ┌─────────────────────────────────────────┐  │
                        │  │ 1. Receive file from verifier           │  │
                        │  │ 2. Compute SHA-256                      │  │
                        │  │ 3. Query smart contract for hash match  │  │
                        │  │ 4. Return match status + metadata       │  │
                        │  └─────────────────────────────────────────┘  │
                        └───────────────────┬───────────────────────────┘
                                            │
                        ┌───────────────────▼───────────────────────────┐
                        │           ETHEREUM (Hardhat Local)            │
                        │                                               │
                        │  EvidenceRegistry.sol                         │
                        │  ┌─────────────────────────────────────────┐  │
                        │  │ mapping(bytes32 => EvidenceRecord)      │  │
                        │  │                                         │  │
                        │  │ struct EvidenceRecord {                 │  │
                        │  │   bytes32  fileHash;                    │  │
                        │  │   bytes32  gpsHash;                     │  │
                        │  │   uint256  timestamp;                   │  │
                        │  │   address  officer;                     │  │
                        │  │   string   ipfsCid;                     │  │
                        │  │ }                                       │  │
                        │  │                                         │  │
                        │  │ function anchorEvidence(...)             │  │
                        │  │ function verifyEvidence(bytes32 hash)   │  │
                        │  │ function getEvidence(bytes32 hash)      │  │
                        │  └─────────────────────────────────────────┘  │
                        └───────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
chainguard/
│
├── frontend/                      # Verification Dashboard & Capture PWA
│   ├── index.html                 # Verification Dashboard
│   ├── capture/                   # Capture PWA (Mobile Evidence Collection)
│   ├── style.css                  # Dark cyberpunk theme
│   ├── main.js                    # App logic, hashing, verification
│   ├── components/                # Reusable UI/logic modules
│   └── assets/                    # Icons, fonts, images
│
├── backend/                       # Express API server
│   ├── server.js                  # Express bootstrap & middleware
│   ├── routes/
│   │   └── evidence.js            # /api/evidence/* route handlers
│   ├── services/
│   │   ├── blockchain.js          # Ethers.js contract interaction
│   │   ├── storage.js             # IPFS/mock storage service
│   │   └── hashing.js             # Server-side hash verification
│   ├── middleware/
│   │   └── auth.js                # JWT validation
│   ├── db/
│   │   └── index.js               # SQLite connection & schema
│   └── config.js                  # Environment configuration
│
├── contracts/                     # Solidity smart contracts
│   ├── contracts/
│   │   └── EvidenceRegistry.sol   # Main evidence registry
│   ├── scripts/
│   │   └── deploy.js              # Deployment script
│   ├── test/
│   │   └── EvidenceRegistry.test.js
│   └── hardhat.config.js
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # This file
│   └── APICONTRACT.md             # API specification
│
├── README.md                      # Project overview & setup
├── package.json                   # Root package (workspace config)
└── .env.example                   # Environment variable template
```

### Directory Purposes

| Directory | Purpose |
|---|---|
| `frontend/` | The Verification Dashboard — a lightweight Vite-served SPA where legal professionals upload evidence files for hash computation and blockchain verification. No framework; pure JS + CSS. |
| `backend/` | Express REST API that mediates between clients and the blockchain/storage layers. Handles auth, evidence submission, encrypted file uploads, and verification queries. |
| `contracts/` | Hardhat-managed Solidity project containing the `EvidenceRegistry` smart contract, deployment scripts, and contract tests. Runs on a local Hardhat Network for the MVP. |
| `docs/` | Architectural documentation and API contracts — the "source of truth" for the system's design. |

---

## 4. Security Architecture

### Threat Model (MVP Scope)

| Threat | Mitigation |
|---|---|
| Image tampered after capture | SHA-256 computed instantly from raw buffer; any bit change produces a different hash |
| GPS spoofing | Architecture-ready for ZKP location proofs (stretch goal) |
| Man-in-the-middle interception | Client-side hashing + AES-256-GCM encryption before transmission |
| Unauthorized submissions | JWT-based officer authentication; contract enforces `onlyAuthorized` |
| On-chain data exposure | Only hashes stored on-chain — never the image or raw GPS |
| Storage tampering | IPFS content-addressing — CID changes if content changes |

### Encryption Flow

```
Raw Image → AES-256-GCM Encrypt (client-side key) → Encrypted Blob → IPFS Upload
                    ↓
            Encryption Key → Stored separately (officer's secure storage)
```

---

## 5. Stretch Goal Architecture Hooks

### Offline Caching
- **IndexedDB** queue on the PWA stores `{ hash, metadata, encryptedBlob }` tuples.
- A **Service Worker** background sync event fires when connectivity returns.
- Queue is drained FIFO; each item is submitted to the backend API.

### Zero-Knowledge Proofs (Location Privacy)
- GPS coordinates are fed into a **ZK-SNARK circuit** that proves "this location is within jurisdiction X" without revealing the exact coordinates.
- The proof is submitted alongside the hash; the smart contract verifies the proof on-chain.

### Hardware Attestation
- On supported devices, the **Secure Enclave** (iOS) or **Titan M** (Android) generates a hardware-bound signing key.
- Each evidence submission is signed with the hardware key — proving the image came from a specific physical device.
- The backend verifies the attestation certificate chain before anchoring.

---

## 6. Current Deployment Strategy

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ Vercel      │────▶│ Railway      │────▶│ Ethereum      │
│ (Frontend & │     │ (Backend API)│     │ Sepolia       │
│ PWA)        │     │              │     │ (Contracts)   │
└─────────────┘     └──────────────┘     └───────────────┘
                           │
                    ┌──────▼──────┐
                    │ Pinata      │
                    │ (IPFS       │
                    │ Storage)    │
                    └─────────────┘
```

The system is deployed using `vercel.json` and a custom Vercel rewrites configuration for the single-page application and PWA routes, while the backend relies on Docker and `railway.toml` for scalable containerized deployment.
