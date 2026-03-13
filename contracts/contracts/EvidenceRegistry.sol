// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EvidenceRegistry
 * @notice Immutable chain-of-custody evidence anchoring contract.
 *         Stores SHA-256 file hashes with capture metadata on-chain.
 */
contract EvidenceRegistry {
    // ──── Structs ────
    struct EvidenceRecord {
        bytes32 fileHash;       // SHA-256 hash of the original file
        bytes32 gpsHash;        // keccak256(lat, lon) for privacy
        uint256 timestamp;      // NTP-synced capture timestamp
        address officer;        // Wallet address of submitting officer
        string  ipfsCid;        // IPFS Content Identifier (set after upload)
        string  evidenceId;     // Human-readable evidence ID
        bool    exists;         // Guard flag
    }

    // ──── State ────
    mapping(bytes32 => EvidenceRecord) private records;
    bytes32[] private hashIndex; // Array of all anchored hashes

    address public owner;

    // ──── Events ────
    event EvidenceAnchored(
        bytes32 indexed fileHash,
        string  evidenceId,
        address indexed officer,
        uint256 timestamp,
        uint256 blockNumber
    );

    event StorageLinked(
        bytes32 indexed fileHash,
        string  ipfsCid
    );

    // ──── Modifiers ────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    // ──── Constructor ────
    constructor() {
        owner = msg.sender;
    }

    // ──── Core Functions ────

    /**
     * @notice Anchor a new piece of evidence to the blockchain.
     * @param _fileHash   SHA-256 hash of the raw evidence file (as bytes32)
     * @param _gpsHash    keccak256 of GPS coordinates
     * @param _timestamp  Capture timestamp (Unix epoch)
     * @param _evidenceId Human-readable evidence ID (e.g. "EV-2026-A3F1")
     */
    function anchorEvidence(
        bytes32 _fileHash,
        bytes32 _gpsHash,
        uint256 _timestamp,
        string calldata _evidenceId
    ) external {
        require(_fileHash != bytes32(0), "Invalid hash");
        require(!records[_fileHash].exists, "Hash already anchored");

        records[_fileHash] = EvidenceRecord({
            fileHash:   _fileHash,
            gpsHash:    _gpsHash,
            timestamp:  _timestamp,
            officer:    msg.sender,
            ipfsCid:    "",
            evidenceId: _evidenceId,
            exists:     true
        });

        hashIndex.push(_fileHash);

        emit EvidenceAnchored(
            _fileHash,
            _evidenceId,
            msg.sender,
            _timestamp,
            block.number
        );
    }

    /**
     * @notice Link an IPFS CID to an existing evidence record.
     * @param _fileHash The file hash of the evidence
     * @param _ipfsCid  The IPFS Content Identifier
     */
    function linkStorage(bytes32 _fileHash, string calldata _ipfsCid) external {
        require(records[_fileHash].exists, "Evidence not found");
        require(
            records[_fileHash].officer == msg.sender,
            "Only the submitting officer can link storage"
        );
        require(bytes(records[_fileHash].ipfsCid).length == 0, "Storage already linked");

        records[_fileHash].ipfsCid = _ipfsCid;
        emit StorageLinked(_fileHash, _ipfsCid);
    }

    /**
     * @notice Verify if a hash exists on the ledger.
     * @param _fileHash The SHA-256 hash to look up
     * @return exists_ Whether the hash is anchored
     * @return evidenceId The evidence ID
     * @return officer The anchoring officer's address
     * @return timestamp The capture timestamp
     * @return gpsHash The hashed GPS coordinates
     * @return ipfsCid The IPFS CID (empty if not yet uploaded)
     */
    function verifyEvidence(bytes32 _fileHash)
        external
        view
        returns (
            bool    exists_,
            string  memory evidenceId,
            address officer,
            uint256 timestamp,
            bytes32 gpsHash,
            string  memory ipfsCid
        )
    {
        EvidenceRecord storage rec = records[_fileHash];
        return (
            rec.exists,
            rec.evidenceId,
            rec.officer,
            rec.timestamp,
            rec.gpsHash,
            rec.ipfsCid
        );
    }

    /**
     * @notice Get the total number of anchored evidence records.
     */
    function getRecordCount() external view returns (uint256) {
        return hashIndex.length;
    }

    /**
     * @notice Get a hash by its index (for enumeration).
     */
    function getHashAtIndex(uint256 _index) external view returns (bytes32) {
        require(_index < hashIndex.length, "Index out of bounds");
        return hashIndex[_index];
    }
}
