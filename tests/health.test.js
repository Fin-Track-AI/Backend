import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('should return HTTP 200', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.strictEqual(res.statusCode, 200);
  });

  it('should return success: true in the response body', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.strictEqual(res.body.success, true);
  });

  it('should include uptime and timestamp in data', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.ok(res.body.data);
    assert.strictEqual(typeof res.body.data.uptime, 'number');
    assert.strictEqual(typeof res.body.data.timestamp, 'string');
  });
});
