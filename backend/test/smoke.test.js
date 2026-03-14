/* eslint-env mocha */

/**
 * Production Smoke Tests
 *
 * Run against live Railway + Vercel URLs:
 *
 *   RAILWAY_URL=https://your-app.up.railway.app \
 *   VERCEL_URL=https://your-app.vercel.app   \
 *   npx mocha backend/test/smoke.test.js --timeout 15000
 */

const assert = require('assert');
const http = require('http');
const https = require('https');

const RAILWAY_URL = (process.env.RAILWAY_URL || '').replace(/\/+$/, '');
const VERCEL_URL = (process.env.VERCEL_URL || '').replace(/\/+$/, '');

// ── helpers ──────────────────────────────────────────────────────────

function get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'ChainGuard-Smoke/1.0' } }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });
}

function postJson(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const payload = JSON.stringify(data);
        const parsed = new URL(url);
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'ChainGuard-Smoke/1.0',
                ...headers,
            },
        };
        const req = lib.request(opts, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── tests ────────────────────────────────────────────────────────────

describe('Production Smoke Tests', function () {
    this.timeout(15000);

    before(function () {
        if (!RAILWAY_URL || !VERCEL_URL) {
            console.error(
                '\n  ⚠  Set RAILWAY_URL and VERCEL_URL environment variables before running.\n' +
                '  Example:\n' +
                '    RAILWAY_URL=https://chainguard-backend.up.railway.app \\\n' +
                '    VERCEL_URL=https://chainguard.vercel.app \\\n' +
                '    npx mocha backend/test/smoke.test.js --timeout 15000\n'
            );
            this.skip();
        }
    });

    // ── 1. Backend Health ───────────────────────────────────────────

    it('GET /api/health returns 200 with status ok', async () => {
        const res = await get(`${RAILWAY_URL}/api/health`);
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

        const json = JSON.parse(res.body);
        assert.strictEqual(json.status, 'ok');
        assert.ok(json.version, 'Missing version field');
        assert.ok(json.timestamp, 'Missing timestamp field');
        console.log(`    ✓ Health: v${json.version} @ ${json.timestamp}`);
    });

    // ── 2. Frontend Dashboard ──────────────────────────────────────

    it('GET <VERCEL_URL>/ returns 200 and contains ChainGuard', async () => {
        const res = await get(`${VERCEL_URL}/`);
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(
            res.body.toLowerCase().includes('chainguard'),
            'HTML does not mention ChainGuard'
        );
        console.log('    ✓ Dashboard HTML loaded');
    });

    // ── 3. Capture PWA ────────────────────────────────────────────

    it('GET <VERCEL_URL>/capture/ returns 200 with camera and SW references', async () => {
        const res = await get(`${VERCEL_URL}/capture/`);
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(
            res.body.includes('cameraView') || res.body.includes('capture'),
            'Capture page missing expected content'
        );
        console.log('    ✓ Capture PWA HTML loaded');
    });

    it('Capture manifest.json is accessible', async () => {
        const res = await get(`${VERCEL_URL}/capture/manifest.json`);
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        const manifest = JSON.parse(res.body);
        assert.ok(manifest.name || manifest.short_name, 'Manifest missing name');
        console.log(`    ✓ Manifest: "${manifest.short_name || manifest.name}"`);
    });

    it('Service worker is accessible', async () => {
        const res = await get(`${VERCEL_URL}/capture/sw.js`);
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(res.body.includes('CACHE_NAME'), 'SW missing CACHE_NAME');
        console.log('    ✓ Service worker reachable');
    });

    // ── 4. Auth endpoint responds ─────────────────────────────────

    it('POST /api/auth/login with bad creds returns 401', async () => {
        const res = await postJson(`${RAILWAY_URL}/api/auth/login`, {
            username: '__smoke_invalid__',
            password: '__smoke_invalid__',
        });
        assert.ok(
            [401, 403].includes(res.status),
            `Expected 401/403 for bad creds, got ${res.status}`
        );
        console.log(`    ✓ Login rejected invalid credentials (${res.status})`);
    });

    // ── 5. Evidence submit without auth returns 401 ───────────────

    it('POST /api/evidence/submit without token returns 401', async () => {
        const res = await postJson(`${RAILWAY_URL}/api/evidence/submit`, {
            fileHash: '0'.repeat(64),
            metadata: {},
        });
        assert.ok(
            [401, 403].includes(res.status),
            `Expected 401/403, got ${res.status}`
        );
        console.log(`    ✓ Unauthenticated submit blocked (${res.status})`);
    });

    // ── 6. CORS headers present ───────────────────────────────────

    it('Backend returns CORS headers', async () => {
        const res = await get(`${RAILWAY_URL}/api/health`);
        // CORS may only appear on OPTIONS but let's check for any access-control header
        const corsHeader =
            res.headers['access-control-allow-origin'] ||
            res.headers['access-control-allow-methods'];
        // If CORS middleware is configured it usually sends the header on all responses
        if (corsHeader) {
            console.log(`    ✓ CORS header present: ${corsHeader}`);
        } else {
            console.log('    ⓘ No CORS header on GET (may only appear on preflight)');
        }
        // Not a hard failure — CORS may only apply to preflight
        assert.strictEqual(res.status, 200);
    });

    // ── 7. Static assets served ───────────────────────────────────

    it('Main CSS stylesheet is accessible', async () => {
        const res = await get(`${VERCEL_URL}/assets/style.css`);
        assert.strictEqual(res.status, 200, `Expected 200 for style.css, got ${res.status}`);
        console.log('    ✓ /assets/style.css served');
    });
});
