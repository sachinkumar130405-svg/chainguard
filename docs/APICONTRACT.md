# ChainGuard — API Contract

> **Version:** 1.0 (MVP)
> **Base URL:** `http://localhost:3001/api`
> **Content-Type:** `application/json` (unless multipart)

---

## Authentication

All mutation endpoints require a Bearer JWT in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

### JWT Payload Structure

```json
{
  "sub": "officer_uuid",
  "name": "Officer Jane Doe",
  "badge": "NYPD-4821",
  "role": "first_responder",
  "iat": 1711900000,
  "exp": 1711986400
}
```

---

## Endpoints

### 1. `POST /api/evidence/submit`

**Purpose:** Submit a file hash and associated metadata for blockchain anchoring.

#### Request

```http
POST /api/evidence/submit HTTP/1.1
Host: localhost:3001
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "fileHash": "a1b2c3d4e5f6...64_hex_chars",
  "metadata": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "timestamp": "2026-03-13T12:00:00.000Z",
    "deviceId": "device_uuid_here",
    "officerId": "officer_uuid_here",
    "captureMode": "photo",
    "resolution": "4032x3024"
  }
}
```

#### Responses

**`201 Created`** — Evidence successfully anchored.

```json
{
  "success": true,
  "data": {
    "evidenceId": "ev_a1b2c3d4",
    "fileHash": "a1b2c3d4e5f6...64_hex_chars",
    "transactionHash": "0xabc123...tx_hash",
    "blockNumber": 42,
    "anchoredAt": "2026-03-13T12:00:05.000Z",
    "status": "anchored"
  }
}
```

**`400 Bad Request`** — Invalid hash format or missing fields.

```json
{
  "success": false,
  "error": {
    "code": "INVALID_HASH",
    "message": "fileHash must be a 64-character hexadecimal string"
  }
}
```

**`401 Unauthorized`** — Missing or invalid JWT.

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired authentication token"
  }
}
```

**`409 Conflict`** — Hash already exists on the ledger.

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_HASH",
    "message": "This evidence hash has already been anchored",
    "existing": {
      "evidenceId": "ev_x9y8z7w6",
      "anchoredAt": "2026-03-12T08:30:00.000Z"
    }
  }
}
```

---

### 2. `POST /api/evidence/upload`

**Purpose:** Upload an encrypted media file to decentralized storage (IPFS) and link it to an existing evidence record.

#### Request

```http
POST /api/evidence/upload HTTP/1.1
Host: localhost:3001
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---|---|
| `evidenceId` | string | ✅ | ID returned from `/submit` |
| `encryptedFile` | binary | ✅ | AES-256-GCM encrypted media file |
| `iv` | string | ✅ | Initialization vector (hex) |
| `mimeType` | string | ✅ | Original file MIME type |

#### Responses

**`200 OK`** — File uploaded and pinned successfully.

```json
{
  "success": true,
  "data": {
    "evidenceId": "ev_a1b2c3d4",
    "storageCid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "storageUrl": "https://gateway.pinata.cloud/ipfs/QmXoyp...",
    "fileSizeBytes": 2048576,
    "uploadedAt": "2026-03-13T12:01:00.000Z"
  }
}
```

**`404 Not Found`** — Evidence ID does not exist.

```json
{
  "success": false,
  "error": {
    "code": "EVIDENCE_NOT_FOUND",
    "message": "No evidence record found for ID: ev_invalid"
  }
}
```

**`413 Payload Too Large`** — File exceeds 50 MB limit.

```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "Encrypted file exceeds maximum size of 50 MB"
  }
}
```

---

### 3. `POST /api/evidence/verify`

**Purpose:** Verify an uploaded file's integrity by computing its hash and checking it against the blockchain record.

#### Request

```http
POST /api/evidence/verify HTTP/1.1
Host: localhost:3001
Content-Type: multipart/form-data
```

> **Note:** This endpoint does NOT require authentication — it is public-facing for legal professionals.

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | binary | ✅ | The original (unencrypted) media file to verify |

#### Response Data Fields (Verification)

| Field | Type | Description |
|---|---|---|
| `computedHash` | string | The SHA-256 fingerprint computed from the uploaded file. |
| `match` | boolean | True if the hash exists on the blockchain. |
| `metadataValid` | boolean | True if the GPS metadata integrity check matches the anchored `gpsHash`. |
| `record` | object | The full evidence record (if `match` is true). |

#### Responses

**`200 OK`** — Hash found on the blockchain. ✅ **MATCH**

```json
{
  "success": true,
  "verified": true,
  "data": {
    "computedHash": "a1b2c3d4e5f6...64_hex_chars",
    "match": true,
    "metadataValid": true,
    "record": {
      "evidenceId": "ev_a1b2c3d4",
      "fileHash": "a1b2c3d4e5f6...64_hex_chars",
      "transactionHash": "0xabc123...tx_hash",
      "blockNumber": 42,
      "anchoredAt": "2026-03-13T12:00:05.000Z",
      "metadata": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timestamp": "2026-03-13T12:00:00.000Z",
        "officerId": "officer_uuid_here",
        "captureMode": "photo"
      }
    }
  }
}
```

**`200 OK`** — Hash NOT found on the blockchain. ❌ **NO MATCH**

```json
{
  "success": true,
  "verified": false,
  "data": {
    "computedHash": "ff00ee11dd22...64_hex_chars",
    "match": false,
    "record": null,
    "message": "No evidence record matches this file's hash. The file may have been altered or was never registered."
  }
}
```

**`400 Bad Request`** — No file provided.

```json
{
  "success": false,
  "error": {
    "code": "NO_FILE",
    "message": "A file must be provided for verification"
  }
}
```

---

### 4. `GET /api/evidence/:evidenceId`

**Purpose:** Retrieve the full record for a specific piece of evidence.

#### Request

```http
GET /api/evidence/ev_a1b2c3d4 HTTP/1.1
Host: localhost:3001
Authorization: Bearer <jwt_token>
```

#### Responses

**`200 OK`**

```json
{
  "success": true,
  "data": {
    "evidenceId": "ev_a1b2c3d4",
    "fileHash": "a1b2c3d4e5f6...64_hex_chars",
    "transactionHash": "0xabc123...tx_hash",
    "blockNumber": 42,
    "anchoredAt": "2026-03-13T12:00:05.000Z",
    "storageCid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "status": "anchored",
    "metadata": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "timestamp": "2026-03-13T12:00:00.000Z",
      "deviceId": "device_uuid_here",
      "officerId": "officer_uuid_here",
      "captureMode": "photo",
      "resolution": "4032x3024"
    }
  }
}
```

**`404 Not Found`**

```json
{
  "success": false,
  "error": {
    "code": "EVIDENCE_NOT_FOUND",
    "message": "No evidence record found for ID: ev_invalid"
  }
}
```

---

### 5. `GET /api/evidence`

**Purpose:** List all evidence records (paginated). Restricted to authenticated users.

#### Request

```http
GET /api/evidence?page=1&limit=20 HTTP/1.1
Host: localhost:3001
Authorization: Bearer <jwt_token>
```

#### Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Records per page (max 100) |
| `officerId` | string | — | Filter by officer |
| `status` | string | — | Filter by status (`anchored`, `pending`) |
| `from` | ISO 8601 | — | Start date filter |
| `to` | ISO 8601 | — | End date filter |

#### Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "evidenceId": "ev_a1b2c3d4",
        "fileHash": "a1b2c3d4...",
        "status": "anchored",
        "anchoredAt": "2026-03-13T12:00:05.000Z",
        "officerId": "officer_uuid_here"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 142,
      "totalPages": 8
    }
  }
}
```

---

## Error Response Format

All errors follow a consistent envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Standard Error Codes

| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `INVALID_HASH` | Hash format invalid |
| 400 | `MISSING_FIELDS` | Required fields absent |
| 400 | `NO_FILE` | File not provided |
| 401 | `UNAUTHORIZED` | Auth token missing/invalid |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `EVIDENCE_NOT_FOUND` | Record does not exist |
| 409 | `DUPLICATE_HASH` | Hash already anchored |
| 413 | `FILE_TOO_LARGE` | File exceeds 50 MB |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `BLOCKCHAIN_UNAVAILABLE` | Cannot reach chain |

---

## Rate Limiting

| Endpoint | Limit |
|---|---|
| `POST /submit` | 30 req/min per officer |
| `POST /upload` | 10 req/min per officer |
| `POST /verify` | 60 req/min per IP |
| `GET /evidence` | 120 req/min per token |

---

### 6. Hardware Attestation

These endpoints handle FIDO2/WebAuthn device registration and authentication for high-integrity evidence capture.

#### `POST /api/attestation/register/options`

**Purpose:** Generate WebAuthn registration options for device enrollment.

- **Auth:** Required (JWT)
- **Response Data (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "rp": { "name": "ChainGuard", "id": "localhost" },
      "user": { "id": "...", "name": "officer_badge", "displayName": "officer_badge" },
      "challenge": "...",
      "pubKeyCredParams": [...],
      "timeout": 60000,
      "attestation": "direct"
    }
  }
  ```

#### `POST /api/attestation/register/verify`

**Purpose:** Verify a WebAuthn registration response and store the credential.

- **Auth:** Required (JWT)
- **Request Body:**
  ```json
  {
    "challengeId": "uuid",
    "credential": { ...WebAuthn_Credential_Object... }
  }
  ```
- **Response:** `201 Created` on success.

#### `POST /api/attestation/authenticate/options`

**Purpose:** Generate WebAuthn authentication options (challenge for signing).

- **Auth:** Required (JWT)
- **Response Data (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "challenge": "...",
      "timeout": 60000,
      "userVerification": "required",
      "allowCredentials": [...]
    }
  }
  ```

#### `POST /api/attestation/authenticate/verify`

**Purpose:** Verify a WebAuthn authentication assertion (device signature).

- **Auth:** Required (JWT)
- **Request Body:**
  ```json
  {
    "challengeId": "uuid",
    "assertion": { ...WebAuthn_Assertion_Object... }
  }
  ```
- **Response:** `200 OK` on success.

#### `GET /api/attestation/devices`

**Purpose:** List all registered devices for the authenticated officer.

- **Auth:** Required (JWT)
- **Response Data (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "devices": [
        { "credentialID": "...", "counter": 0, "transports": ["usb", "nfc", "ble", "internal"] }
      ]
    }
  }
  ```
