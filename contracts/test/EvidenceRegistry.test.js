const { expect } = require('chai');

describe('EvidenceRegistry', function () {
  async function deploy() {
    const [officer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('EvidenceRegistry');
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, officer, other };
  }

  it('anchors and verifies evidence', async function () {
    const { contract, officer } = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes('file1'));
    const metadataJson = '{"foo":"bar"}';

    await contract.connect(officer).anchorEvidence(hash, 'OFFICER-1', metadataJson);

    const [exists, timestamp, officerAddress, metaJson] =
      await contract.verifyEvidence(hash);

    expect(exists).to.equal(true);
    expect(officerAddress).to.equal(officer.address);
    expect(metaJson).to.equal(metadataJson);
    expect(timestamp).to.be.gt(0);
  });

  it('rejects duplicate hashes', async function () {
    const { contract } = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes('file1'));

    await contract.anchorEvidence(hash, 'OFFICER-1', '{}');
    await expect(
      contract.anchorEvidence(hash, 'OFFICER-1', '{}'),
    ).to.be.revertedWith('duplicate hash');
  });

  it('only authorized accounts can anchor evidence', async function () {
    const { contract, officer, other } = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes('file2'));

    // other is not authorized
    await expect(
      contract.connect(other).anchorEvidence(hash, 'OFFICER-2', '{}')
    ).to.be.revertedWith('not authorized');

    // authorize other
    await contract.connect(officer).authorize(other.address);

    // now other can anchor
    await expect(
      contract.connect(other).anchorEvidence(hash, 'OFFICER-2', '{}')
    ).to.not.be.reverted;

    // revoke authorization
    const hash3 = ethers.keccak256(ethers.toUtf8Bytes('file3'));
    await contract.connect(officer).revokeAuthorization(other.address);

    // other can no longer anchor
    await expect(
      contract.connect(other).anchorEvidence(hash3, 'OFFICER-2', '{}')
    ).to.be.revertedWith('not authorized');
  });

  it('only owner can authorize and revoke', async function () {
    const { contract, officer, other } = await deploy();

    await expect(
      contract.connect(other).authorize(other.address)
    ).to.be.revertedWith('only owner');

    await expect(
      contract.connect(other).revokeAuthorization(officer.address)
    ).to.be.revertedWith('only owner');
  });

  it('owner cannot revoke themselves', async function () {
    const { contract, officer } = await deploy();

    await expect(
      contract.connect(officer).revokeAuthorization(officer.address)
    ).to.be.revertedWith('cannot revoke owner');
  });

  it('only anchoring officer can link storage', async function () {
    const { contract, officer, other } = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes('file1'));

    await contract.connect(officer).anchorEvidence(hash, 'OFFICER-1', '{}');

    await expect(
      contract.connect(other).linkStorage(hash, 'cid'),
    ).to.be.revertedWith('only anchoring officer');

    await contract.connect(officer).linkStorage(hash, 'cid1');
    const rec = await contract.getEvidence(hash);
    expect(rec.storageCid).to.equal('cid1');
  });
});

