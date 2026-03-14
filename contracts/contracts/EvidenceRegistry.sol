// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract EvidenceRegistry is Ownable2Step {
    struct EvidenceRecord {
        bytes32 fileHash;
        uint256 timestamp;
        address officer;
        bytes32 gpsHash;
        string ipfsCid;
    }

    mapping(bytes32 => EvidenceRecord) private records;
    bytes32[] private hashes;

    mapping(address => bool) public isAuthorized;

    modifier onlyAuthorized() {
        require(isAuthorized[msg.sender], "not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {
        isAuthorized[msg.sender] = true;
    }

    function authorize(address _address) external onlyOwner {
        isAuthorized[_address] = true;
    }

    function revokeAuthorization(address _address) external onlyOwner {
        require(_address != owner(), "cannot revoke owner");
        isAuthorized[_address] = false;
    }

    event EvidenceAnchored(bytes32 indexed fileHash, address indexed officer, uint256 timestamp);
    event StorageLinked(bytes32 indexed fileHash, string ipfsCid);

    function anchorEvidence(bytes32 fileHash, bytes32 gpsHash) external onlyAuthorized {
        require(fileHash != bytes32(0), "fileHash required");
        require(records[fileHash].fileHash == bytes32(0), "duplicate hash");

        EvidenceRecord storage rec = records[fileHash];
        rec.fileHash = fileHash;
        rec.timestamp = block.timestamp;
        rec.officer = msg.sender;
        rec.gpsHash = gpsHash;

        hashes.push(fileHash);

        emit EvidenceAnchored(fileHash, msg.sender, block.timestamp);
    }

    function linkStorage(bytes32 fileHash, string calldata ipfsCid) external {
        EvidenceRecord storage rec = records[fileHash];
        require(rec.fileHash != bytes32(0), "not found");
        require(rec.officer == msg.sender, "only anchoring officer");

        rec.ipfsCid = ipfsCid;
        emit StorageLinked(fileHash, ipfsCid);
    }

    function verifyEvidence(bytes32 fileHash)
        external
        view
        returns (
            bool exists,
            uint256 timestamp,
            address officer,
            bytes32 gpsHash,
            string memory ipfsCid
        )
    {
        EvidenceRecord storage rec = records[fileHash];
        if (rec.fileHash == bytes32(0)) {
            return (false, 0, address(0), bytes32(0), "");
        }
        return (true, rec.timestamp, rec.officer, rec.gpsHash, rec.ipfsCid);
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

