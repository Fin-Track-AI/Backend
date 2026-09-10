import request from 'supertest';
import app from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('should return HTTP 200', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.statusCode).toBe(200);
  });

  it('should return success: true in the response body', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.success).toBe(true);
  });

  it('should include uptime and timestamp in data', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.data.timestamp).toBe('string');
  });
});
