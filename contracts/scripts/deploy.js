const fs = require('fs');
const path = require('path');

async function main() {
  const EvidenceRegistry = await ethers.getContractFactory('EvidenceRegistry');
  const contract = await EvidenceRegistry.deploy();
  await contract.deployed();

  console.log('EvidenceRegistry deployed to:', contract.address);

  const deployment = {
    address: contract.address,
    abi: (await artifacts.readArtifact('EvidenceRegistry')).abi,
  };

  const outDir = path.join(__dirname, '..');
  const backendContractsDir = path.join(
    __dirname,
    '..',
    '..',
    'backend',
    'contracts',
  );

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(backendContractsDir)) {
    fs.mkdirSync(backendContractsDir, { recursive: true });
  }

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

