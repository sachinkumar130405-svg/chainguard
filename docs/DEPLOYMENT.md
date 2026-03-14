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

### Key Deployment Secrets
- `RPC_URL`: Your Sepolia provider URL (e.g., from Alchemy or Infura).
- `PRIVATE_KEY`: The private key of the wallet used to deploy and interact with the contracts.
- `PINATA_API_KEY` / `SECRET_KEY`: For IPFS pinning.
- `JWT_SECRET`: A long, random string for signing authentication tokens.

## Deployment Steps

1.  **Smart Contracts**:
    ```bash
    npx hardhat run scripts/deploy.js --network sepolia
    ```
    *Copy the resulting contract address to `CONTRACT_ADDRESS`.*

2.  **Backend (Railway)**:
    - Connect your GitHub repository.
    - Add a `chainguard.db` volume mount at `/app/backend/data/`.
    - Set environment variables.

3.  **Frontend (Vercel)**:
    - Connect your GitHub repository.
    - Set `VITE_API_URL` (if applicable) to your Railway backend URL.
    - Deploy.
