const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Deploying EvidenceRegistry to network:', hre.network.name);

  const EvidenceRegistry = await ethers.getContractFactory('EvidenceRegistry');
  const contract = await EvidenceRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx.wait();

  const network = hre.network.name;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log('EvidenceRegistry deployed to:', address);
  console.log('Transaction hash:            ', deployTx.hash);
  console.log('Block number:                ', receipt.blockNumber);

  const deployment = {
    address,
    transactionHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    network,
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    abi: (await artifacts.readArtifact('EvidenceRegistry')).abi,
  };

  const outDir = path.join(__dirname, '..');
  const backendContractsDir = path.join(__dirname, '..', '..', 'backend', 'contracts');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(backendContractsDir)) fs.mkdirSync(backendContractsDir, { recursive: true });

  // Write full deployment.json (includes ABI for backend consumption)
  fs.writeFileSync(
    path.join(outDir, 'deployment.json'),
    JSON.stringify(deployment, null, 2),
  );

  fs.writeFileSync(
    path.join(backendContractsDir, 'deployment.json'),
    JSON.stringify(deployment, null, 2),
  );

  fs.writeFileSync(
    path.join(backendContractsDir, 'EvidenceRegistry.abi.json'),
    JSON.stringify(deployment.abi, null, 2),
  );

  const etherscanBase = network === 'sepolia'
    ? 'https://sepolia.etherscan.io'
    : 'https://etherscan.io';

  console.log('\n✅ Deployment complete!');
  console.log(`   Contract:    ${etherscanBase}/address/${address}`);
  console.log(`   Transaction: ${etherscanBase}/tx/${deployTx.hash}`);
  console.log('\n📝 Saved deployment.json to:');
  console.log(`   ${path.join(outDir, 'deployment.json')}`);
  console.log(`   ${path.join(backendContractsDir, 'deployment.json')}`);
  console.log('\n🔧 Next step: set CONTRACT_ADDRESS in your environment:');
  console.log(`   CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
