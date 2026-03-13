/* eslint-env mocha */

const path = require('path');
process.env.MOCK_BLOCKCHAIN = '1';
process.env.SQLITE_PATH = path.join(__dirname, '..', 'data', 'test-e2e.db');
process.env.ENABLE_REQUEST_LOGGING = 'false';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../config');
const app = require('../server');

function makeJwt(overrides = {}) {
  const payload = {
    sub: 'officer-uuid',
    name: 'Officer Jane Doe',
    badge: 'NYPD-4821',
    role: config.jwt.requiredRole,
    ...overrides,
  };
  return jwt.sign(payload, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: '1h',
  });
}

describe('ChainGuard backend e2e (mock blockchain)', function () {
  this.timeout(10000);

  const token = `Bearer ${makeJwt()}`;

  it('anchors evidence and retrieves it', async () => {
    const fileHash =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const metadata = {
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: new Date().toISOString(),
      deviceId: 'device-123',
      officerId: 'officer-uuid',
      captureMode: 'photo',
      resolution: '4032x3024',
    };

    const submitRes = await request(app)
      .post('/api/evidence/submit')
      .set('Authorization', token)
      .send({ fileHash, metadata })
      .expect(201);

    submitRes.body.should;

    const { evidenceId } = submitRes.body.data;

    const getRes = await request(app)
      .get(`/api/evidence/${evidenceId}`)
      .set('Authorization', token)
      .expect(200);

    if (!getRes.body.success) {
      throw new Error('Expected success=true for GET /:id');
    }
  });
});

