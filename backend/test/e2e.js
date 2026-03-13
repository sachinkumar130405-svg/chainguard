/**
 * ChainGuard — End-to-End Test
 *
 * Prerequisites (run in separate terminals):
 *   1. cd contracts && npx hardhat node
 *   2. cd contracts && npm run deploy
 *   3. cd backend  && npm run dev
 *
 * Then run:  node test/e2e.js
 */

const crypto = require("crypto");

const API_BASE = process.env.API_BASE || "http://localhost:3001/api";
let TOKEN = "";
let passCount = 0;
let failCount = 0;

function pass(msg) { passCount++; console.log(`  ✅  ${msg}`); }
function fail(msg, detail) { failCount++; console.log(`  ❌  ${msg} → ${detail}`); }

async function api(endpoint, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

    const res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });
    const body = await res.json();
    return { status: res.status, body };
}

// ──── Tests ────

async function run() {
    console.log("\n🧪 ChainGuard End-to-End Tests\n");
    console.log(`   Target: ${API_BASE}\n`);
    console.log("─".repeat(50));

    try {
        // 1. Health check
        const h = await api("/health");
        h.status === 200 && h.body.success
            ? pass("Health check")
            : fail("Health check", `status=${h.status}`);

        // 2. Obtain dev JWT
        const t = await api("/dev/token?officerId=e2e_officer&name=E2E+Officer&badge=E2E-0001");
        if (t.status === 200 && t.body.token) {
            TOKEN = t.body.token;
            pass("Dev token acquired");
        } else {
            fail("Dev token", `status=${t.status}`);
            throw new Error("Cannot proceed without auth token");
        }

        // 3. Reject unauthenticated submit
        const savedToken = TOKEN;
        TOKEN = "";
        const u = await api("/evidence/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileHash: "a".repeat(64), metadata: { timestamp: new Date().toISOString() } }),
        });
        TOKEN = savedToken;
        u.status === 401
            ? pass("Auth guard rejects unauthenticated (401)")
            : fail("Auth guard", `expected 401, got ${u.status}`);

        // 4. Submit evidence
        const testPayload = `ChainGuard-E2E-${Date.now()}`;
        const testBuffer = Buffer.from(testPayload);
        const fileHash = crypto.createHash("sha256").update(testBuffer).digest("hex");

        const s = await api("/evidence/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileHash,
                metadata: {
                    latitude: 40.7128,
                    longitude: -74.006,
                    timestamp: new Date().toISOString(),
                    officerId: "e2e_officer",
                    deviceId: "e2e_device",
                    captureMode: "photo",
                    resolution: "1920x1080",
                },
            }),
        });

        let evidenceId = null;
        if (s.status === 201 && s.body.data?.evidenceId) {
            evidenceId = s.body.data.evidenceId;
            pass(`Submit evidence → ${evidenceId} (block ${s.body.data.blockNumber})`);
        } else {
            fail("Submit evidence", JSON.stringify(s.body.error));
        }

        // 5. Duplicate rejection
        const d = await api("/evidence/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileHash, metadata: { timestamp: new Date().toISOString() } }),
        });
        d.status === 409
            ? pass("Duplicate hash rejected (409)")
            : fail("Duplicate rejection", `expected 409, got ${d.status}`);

        // 6. Upload file
        if (evidenceId) {
            const form = new FormData();
            form.append("evidenceId", evidenceId);
            form.append("encryptedFile", new Blob([testBuffer]), "evidence.bin");

            const upRes = await fetch(`${API_BASE}/evidence/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${TOKEN}` },
                body: form,
            });
            const upBody = await upRes.json();
            if (upRes.status === 200 && upBody.data?.storageCid) {
                pass(`Upload file → CID: ${upBody.data.storageCid.slice(0, 20)}...`);
            } else {
                fail("Upload file", JSON.stringify(upBody.error));
            }
        }

        // 7. Verify file — should MATCH
        {
            const form = new FormData();
            form.append("file", new Blob([testBuffer]), "evidence.bin");

            const vRes = await fetch(`${API_BASE}/evidence/verify`, { method: "POST", body: form });
            const vBody = await vRes.json();
            vRes.status === 200 && vBody.verified === true
                ? pass("Verify known file → MATCH ✓")
                : fail("Verify (match)", JSON.stringify(vBody));
        }

        // 8. Verify unknown file — should NOT match
        {
            const form = new FormData();
            form.append("file", new Blob([`Unknown-${Date.now()}`]), "unknown.bin");

            const vRes = await fetch(`${API_BASE}/evidence/verify`, { method: "POST", body: form });
            const vBody = await vRes.json();
            vRes.status === 200 && vBody.verified === false
                ? pass("Verify unknown file → NO MATCH ✓")
                : fail("Verify (no match)", JSON.stringify(vBody));
        }

        // 9. Get evidence by ID
        if (evidenceId) {
            const g = await api(`/evidence/${evidenceId}`);
            g.status === 200 && g.body.data?.evidenceId === evidenceId
                ? pass(`Get by ID → ${evidenceId}`)
                : fail("Get by ID", JSON.stringify(g.body.error));
        }

        // 10. List evidence (paginated)
        const l = await api("/evidence?page=1&limit=10");
        if (l.status === 200 && Array.isArray(l.body.data?.records)) {
            pass(`List → ${l.body.data.records.length} record(s), page ${l.body.data.pagination.page}/${l.body.data.pagination.totalPages}`);
        } else {
            fail("List evidence", JSON.stringify(l.body.error));
        }

    } catch (err) {
        fail("Fatal error", err.message);
    }

    console.log("─".repeat(50));
    console.log(`\n   Passed: ${passCount}  |  Failed: ${failCount}\n`);
    process.exit(failCount > 0 ? 1 : 0);
}

run();
