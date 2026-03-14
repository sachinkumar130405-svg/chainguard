# ChainGuard Smart Contract Security Audit

**Date:** March 14, 2026
**Target:** `contracts/contracts/EvidenceRegistry.sol`
**Auditor:** AntiGravity / AI Assistant

## Overview
This document contains the security review of the `EvidenceRegistry` smart contract. The contract is relatively simple, primarily storing hashes and metadata, and relies on an external backend for authorization. Overall, the contract is secure from critical vulnerabilities (like reentrancy or integer overflows), but some optimizations and best practices should be addressed for production.

## Findings Summary

| Severity | Issue | Description |
| :--- | :--- | :--- |
| **Low** | Unused function parameter | The `officerId` parameter in `anchorEvidence` is passed but never used. |
| **Low** | Floating Pragma | The contract uses a floating pragma `^0.8.24` instead of a locked version. |
| **Low** | Missing Ownership Transfer | The contract lacks a mechanism to transfer or recover ownership if the primary key is compromised. |
| **Gas / Info** | Unbounded Array | The `hashes` array grows indefinitely. |

---

## Detailed Findings & Recommendations

### 1. Unused Function Parameter in `anchorEvidence` (Low/Gas)
**Description:**
The function `anchorEvidence(bytes32 fileHash, string calldata officerId, bytes32 gpsHash)` accepts an `officerId` string as calldata but does not use it in the function logic or emit it in an event. The officer is currently tracked via `msg.sender` (which is the authorized backend wallet).

**Impact:**
Passing an unused parameter wastes gas for every transaction (calldata costs gas). 

**Recommendation:**
If the `officerId` (like a badge number) should be recorded on-chain, it should be emitted in the `EvidenceAnchored` event. If it does not need to be recorded on-chain, remove the parameter entirely from the function signature to save gas.
*Suggested Fix:* Remove `string calldata officerId` from `anchorEvidence` or emit it in the event.

### 2. Floating Pragma (Low)
**Description:**
The contract uses `pragma solidity ^0.8.24;`. 

**Impact:**
Contracts should be deployed with the same compiler version and flags that they have been tested with. Locking the pragma helps ensure that contracts do not accidentally get deployed using another pragma, which might introduce bugs or changes in contract semantics.

**Recommendation:**
Lock the exact compiler version:
```solidity
pragma solidity 0.8.24;
```

### 3. Missing 2-step Ownership Transfer (Low)
**Description:**
The contract owner is set unconditionally in the constructor. There are functions to manage authorized addresses (`authorize`, `revokeAuthorization`), but there is no mechanism to transfer the `owner` role to a new address.

**Impact:**
If the private key of the deployer is compromised or lost, the contract cannot be managed (new backend addresses cannot be authorized), requiring a full redeployment of the registry.

**Recommendation:**
Implement a standard ownership management pattern (e.g., using OpenZeppelin's `Ownable2Step` module) so the owner can securely hand off control to a multi-sig or a new key without risking sending ownership to a typoed address.

### 4. Unbounded Array for `hashes` (Gas/Info)
**Description:**
Whenever evidence is anchored, the `fileHash` is pushed to the `hashes` array. 

**Impact:**
If the contract ever needed to iterate over this array on-chain, it would eventually hit the block gas limit. Currently, the contract only provides getter functions (`getHashAtIndex`, `getRecordCount`) intended for off-chain querying, so this does not present an immediate denial-of-service (DoS) risk.

**Recommendation:**
Ensure no future on-chain logic attempts to iterate over the entire `hashes` array. If enumeration is only needed off-chain, relying purely on indexing off-chain events (like The Graph or custom indexers) might allow removing the `hashes` array entirely to save storage gas costs.

## Conclusion
The `EvidenceRegistry.sol` contract is well-structured for its purpose. It correctly implements authorization checks for state-mutating functions and uses mappings securely. Addressing the unused parameter and locking the pragma are the most immediate actionable items before moving to production.
