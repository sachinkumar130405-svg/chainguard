const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EvidenceRegistry", function () {
    let registry;
    let owner, officer1, officer2;

    // Test data
    const fileHash1 = "0x" + "a1b2c3d4".repeat(8);
    const fileHash2 = "0x" + "e5f6a7b8".repeat(8);
    const gpsHash1  = "0x" + "11112222".repeat(8);
    const timestamp1 = Math.floor(Date.now() / 1000);
    const evidenceId1 = "EV-2026-A1B2";

    beforeEach(async function () {
        [owner, officer1, officer2] = await ethers.getSigners();
        const EvidenceRegistry = await ethers.getContractFactory("EvidenceRegistry");
        registry = await EvidenceRegistry.deploy();
    });

    // ──── Deployment ────

    describe("Deployment", function () {
        it("should set the deployer as owner", async function () {
            expect(await registry.owner()).to.equal(owner.address);
        });

        it("should start with zero records", async function () {
            expect(await registry.getRecordCount()).to.equal(0);
        });
    });

    // ──── anchorEvidence ────

    describe("anchorEvidence", function () {
        it("should anchor evidence successfully", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);

            const result = await registry.verifyEvidence(fileHash1);
            expect(result[0]).to.be.true;              // exists
            expect(result[1]).to.equal(evidenceId1);    // evidenceId
            expect(result[2]).to.equal(owner.address);  // officer
            expect(result[3]).to.equal(timestamp1);     // timestamp
            expect(result[4]).to.equal(gpsHash1);       // gpsHash
            expect(result[5]).to.equal("");              // ipfsCid (empty initially)
        });

        it("should increment record count", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            expect(await registry.getRecordCount()).to.equal(1);

            await registry.anchorEvidence(fileHash2, gpsHash1, timestamp1, "EV-2026-E5F6");
            expect(await registry.getRecordCount()).to.equal(2);
        });

        it("should emit EvidenceAnchored event", async function () {
            await expect(
                registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1)
            ).to.emit(registry, "EvidenceAnchored");
        });

        it("should reject zero hash", async function () {
            const zeroHash = "0x" + "0".repeat(64);
            await expect(
                registry.anchorEvidence(zeroHash, gpsHash1, timestamp1, "EV-ZERO")
            ).to.be.revertedWith("Invalid hash");
        });

        it("should reject duplicate hash", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            await expect(
                registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, "EV-DUP")
            ).to.be.revertedWith("Hash already anchored");
        });

        it("should allow different officers to anchor different hashes", async function () {
            await registry.connect(officer1).anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            await registry.connect(officer2).anchorEvidence(fileHash2, gpsHash1, timestamp1, "EV-2026-E5F6");
            expect(await registry.getRecordCount()).to.equal(2);
        });
    });

    // ──── verifyEvidence ────

    describe("verifyEvidence", function () {
        it("should return exists=true for anchored evidence", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            const result = await registry.verifyEvidence(fileHash1);
            expect(result[0]).to.be.true;
        });

        it("should return exists=false for unknown hash", async function () {
            const unknownHash = "0x" + "ff".repeat(32);
            const result = await registry.verifyEvidence(unknownHash);
            expect(result[0]).to.be.false;
        });

        it("should return correct full metadata", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            const [exists, eid, officer, ts, gps, cid] = await registry.verifyEvidence(fileHash1);

            expect(exists).to.be.true;
            expect(eid).to.equal(evidenceId1);
            expect(officer).to.equal(owner.address);
            expect(ts).to.equal(timestamp1);
            expect(gps).to.equal(gpsHash1);
            expect(cid).to.equal("");
        });
    });

    // ──── linkStorage ────

    describe("linkStorage", function () {
        const testCid = "QmTestCID12345abcdef";

        beforeEach(async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
        });

        it("should link IPFS CID to evidence", async function () {
            await registry.linkStorage(fileHash1, testCid);
            const result = await registry.verifyEvidence(fileHash1);
            expect(result[5]).to.equal(testCid);
        });

        it("should emit StorageLinked event", async function () {
            await expect(registry.linkStorage(fileHash1, testCid))
                .to.emit(registry, "StorageLinked")
                .withArgs(fileHash1, testCid);
        });

        it("should reject if evidence not found", async function () {
            const fakeHash = "0x" + "bb".repeat(32);
            await expect(
                registry.linkStorage(fakeHash, testCid)
            ).to.be.revertedWith("Evidence not found");
        });

        it("should reject if caller is not the submitting officer", async function () {
            await expect(
                registry.connect(officer1).linkStorage(fileHash1, testCid)
            ).to.be.revertedWith("Only the submitting officer can link storage");
        });

        it("should reject if storage already linked", async function () {
            await registry.linkStorage(fileHash1, testCid);
            await expect(
                registry.linkStorage(fileHash1, "QmAnotherCID")
            ).to.be.revertedWith("Storage already linked");
        });
    });

    // ──── getHashAtIndex ────

    describe("getHashAtIndex", function () {
        it("should return hash by index", async function () {
            await registry.anchorEvidence(fileHash1, gpsHash1, timestamp1, evidenceId1);
            await registry.anchorEvidence(fileHash2, gpsHash1, timestamp1, "EV-2026-E5F6");

            expect(await registry.getHashAtIndex(0)).to.equal(fileHash1);
            expect(await registry.getHashAtIndex(1)).to.equal(fileHash2);
        });

        it("should revert for out-of-bounds index", async function () {
            await expect(registry.getHashAtIndex(0)).to.be.revertedWith("Index out of bounds");
        });
    });
});
