/**
 * Blockchain Service — Ethers.js interaction with EvidenceRegistry contract.
 *
 * Connects to the local Hardhat node and provides functions to
 * anchor evidence, verify hashes, and link storage CIDs.
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const config = require("../config");

// ──── Load deployment info & ABI ────
let provider, signer, contract;
let initialized = false;

function getDeploymentPath(filename) {
    return path.join(__dirname, "..", filename);
}

async function init() {
    if (initialized) return;

    try {
        // Connect to local Hardhat node
        provider = new ethers.JsonRpcProvider(config.blockchain.url);

        // Use the first Hardhat account as the signer
        signer = await provider.getSigner(0);

        console.log(`⛓️  Connected to blockchain at ${config.blockchain.url}`);
        console.log(`   Signer: ${await signer.getAddress()}`);

        // Load contract address
        const deploymentPath = getDeploymentPath("deployment.json");
        if (!fs.existsSync(deploymentPath)) {
            throw new Error(
                "deployment.json not found. Run 'npm run deploy' in the contracts/ directory first."
            );
        }

        const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

        // Load ABI
        const abiPath = getDeploymentPath("EvidenceRegistryABI.json");
        if (!fs.existsSync(abiPath)) {
            throw new Error(
                "EvidenceRegistryABI.json not found. Run 'npm run deploy' in the contracts/ directory first."
            );
        }

        const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

        // Create contract instance
        contract = new ethers.Contract(deployment.contractAddress, abi, signer);

        console.log(`   Contract: ${deployment.contractAddress}`);

        const count = await contract.getRecordCount();
        console.log(`   Records on chain: ${count}\n`);

        initialized = true;
    } catch (err) {
        console.error("❌ Blockchain init failed:", err.message);
        console.error("   Make sure the Hardhat node is running and the contract is deployed.\n");
        throw err;
    }
}

// ──── Anchor Evidence ────
async function anchorEvidence(fileHash, gpsHash, timestamp, evidenceId) {
    await init();

    // Convert hex strings to bytes32
    const fileHashBytes = "0x" + fileHash.padStart(64, "0");
    const gpsHashBytes = "0x" + gpsHash.padStart(64, "0");

    const tx = await contract.anchorEvidence(
        fileHashBytes,
        gpsHashBytes,
        timestamp,
        evidenceId
    );

    const receipt = await tx.wait();

    return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
    };
}

// ──── Verify Evidence ────
async function verifyEvidence(fileHash) {
    await init();

    const fileHashBytes = "0x" + fileHash.padStart(64, "0");

    const result = await contract.verifyEvidence(fileHashBytes);

    return {
        exists: result[0],
        evidenceId: result[1],
        officer: result[2],
        timestamp: Number(result[3]),
        gpsHash: result[4],
        ipfsCid: result[5],
    };
}

// ──── Link Storage ────
async function linkStorage(fileHash, ipfsCid) {
    await init();

    const fileHashBytes = "0x" + fileHash.padStart(64, "0");

    const tx = await contract.linkStorage(fileHashBytes, ipfsCid);
    await tx.wait();

    return { success: true };
}

// ──── Get Record Count ────
async function getRecordCount() {
    await init();
    const count = await contract.getRecordCount();
    return Number(count);
}

module.exports = {
    init,
    anchorEvidence,
    verifyEvidence,
    linkStorage,
    getRecordCount,
};
