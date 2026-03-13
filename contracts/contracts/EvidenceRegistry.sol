// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EvidenceRegistry {
    struct EvidenceRecord {
        bytes32 fileHash;
        uint256 timestamp;
        address officer;
        string metadataJson;
        string storageCid;
    }

    mapping(bytes32 => EvidenceRecord) private records;
    bytes32[] private hashes;

    event EvidenceAnchored(bytes32 indexed fileHash, address indexed officer, uint256 timestamp);
    event StorageLinked(bytes32 indexed fileHash, string storageCid);

    function anchorEvidence(bytes32 fileHash, string calldata officerId, string calldata metadataJson) external {
        require(fileHash != bytes32(0), "fileHash required");
        require(records[fileHash].fileHash == bytes32(0), "duplicate hash");

        EvidenceRecord storage rec = records[fileHash];
        rec.fileHash = fileHash;
        rec.timestamp = block.timestamp;
        rec.officer = msg.sender;
        rec.metadataJson = metadataJson;

        hashes.push(fileHash);

        emit EvidenceAnchored(fileHash, msg.sender, block.timestamp);
    }

    function linkStorage(bytes32 fileHash, string calldata storageCid) external {
        EvidenceRecord storage rec = records[fileHash];
        require(rec.fileHash != bytes32(0), "not found");
        require(rec.officer == msg.sender, "only anchoring officer");

        rec.storageCid = storageCid;
        emit StorageLinked(fileHash, storageCid);
    }

    function verifyEvidence(bytes32 fileHash)
        external
        view
        returns (
            bool exists,
            uint256 timestamp,
            address officer,
            string memory metadataJson,
            string memory storageCid
        )
    {
        EvidenceRecord storage rec = records[fileHash];
        if (rec.fileHash == bytes32(0)) {
            return (false, 0, address(0), "", "");
        }
        return (true, rec.timestamp, rec.officer, rec.metadataJson, rec.storageCid);
    }

    function getEvidence(bytes32 fileHash) external view returns (EvidenceRecord memory) {
        return records[fileHash];
    }

    function getRecordCount() external view returns (uint256) {
        return hashes.length;
    }

    function getHashAtIndex(uint256 index) external view returns (bytes32) {
        require(index < hashes.length, "index out of range");
        return hashes[index];
    }
}

