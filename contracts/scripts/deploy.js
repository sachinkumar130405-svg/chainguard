const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Deploying EvidenceRegistry...\n");

    const EvidenceRegistry = await hre.ethers.getContractFactory("EvidenceRegistry");
    const registry = await EvidenceRegistry.deploy();

    await registry.waitForDeployment();
    const address = await registry.getAddress();

    console.log(`✅ EvidenceRegistry deployed to: ${address}`);
    console.log(`   Network: ${hre.network.name}`);
    console.log(`   Chain ID: ${(await hre.ethers.provider.getNetwork()).chainId}\n`);

    // Write deployment info to a shared file the backend can read
    const deploymentInfo = {
        contractAddress: address,
        network: hre.network.name,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        deployedAt: new Date().toISOString(),
    };

    const outDir = path.join(__dirname, "..", "..", "backend");
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(
        path.join(outDir, "deployment.json"),
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log(`📄 Deployment info written to backend/deployment.json`);

    // Also copy the ABI for the backend
    const artifactPath = path.join(
        __dirname, "..", "artifacts", "contracts",
        "EvidenceRegistry.sol", "EvidenceRegistry.json"
    );

    // ABI will be available after compile; we'll copy it if it exists
    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        fs.writeFileSync(
            path.join(outDir, "EvidenceRegistryABI.json"),
            JSON.stringify(artifact.abi, null, 2)
        );
        console.log(`📄 Contract ABI written to backend/EvidenceRegistryABI.json`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
