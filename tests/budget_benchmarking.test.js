import request from 'supertest';
import app from '../src/app.js';
import { BudgetModel } from '../src/models/budget.model.js';
import { TransactionModel } from '../src/models/transaction.model.js';

/**
 * BR-08: Budgets & Threshold Alerts
 * BR-09: Anonymized Peer Benchmarking
 */

const MOCK_AUTH_HEADER = 'Bearer mock_token_123';
const TEST_USER_ID = 'user_123';

beforeEach(async () => {
  await BudgetModel.deleteMany({});
  await TransactionModel.deleteMany({});
});

describe('BR-08: Budgets & Threshold Alerts', () => {
  it('should set monthly and category budgets successfully', async () => {
    const res = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({
        month: '2026-09',
        overallBudget: 40000,
        categoryBudgets: [
          { category: 'Food & Dining', amount: 10000 },
          { category: 'Shopping', amount: 5000 },
        ],
        alertThresholds: [80, 100],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.overallBudget).toBe(40000);
    expect(res.body.data.categoryBudgets.length).toBe(2);
  });

  it('should trigger WARNING alert when category spending reaches 80%', async () => {
    // 1. Set budget for Food & Dining = 10,000
    await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({
        month: '2026-09',
        overallBudget: 50000,
        categoryBudgets: [{ category: 'Food & Dining', amount: 10000 }],
        alertThresholds: [80, 100],
      });

    // 2. Add transaction of 8,500 (85%) in Food & Dining
    await TransactionModel.create({
      userId: TEST_USER_ID,
      title: 'Restaurant Dinner',
      amount: 8500,
      type: 'expense',
      category: 'Food & Dining',
      date: new Date('2026-09-15'),
    });

    // 3. Fetch budget with alerts
    const res = await request(app)
      .get('/api/v1/budgets?month=2026-09')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.alerts.length).toBeGreaterThan(0);
    const warnAlert = res.body.data.alerts.find(
      (a) => a.category === 'Food & Dining' && a.level === 'WARNING'
    );
    expect(warnAlert).toBeDefined();
    expect(warnAlert.currentPct).toBe(85);
  });

  it('should trigger EXCEEDED alert when spending reaches or exceeds 100%', async () => {
    // 1. Set budget for Shopping = 5,000
    await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({
        month: '2026-09',
        overallBudget: 20000,
        categoryBudgets: [{ category: 'Shopping', amount: 5000 }],
        alertThresholds: [80, 100],
      });

    // 2. Add transaction of 5,500 (110%) in Shopping
    await TransactionModel.create({
      userId: TEST_USER_ID,
      title: 'Electronics Store',
      amount: 5500,
      type: 'expense',
      category: 'Shopping',
      date: new Date('2026-09-18'),
    });

    // 3. Fetch alerts
    const res = await request(app)
      .get('/api/v1/budgets/alerts?month=2026-09')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(res.status).toBe(200);
    const exceededAlert = res.body.data.alerts.find(
      (a) => a.category === 'Shopping' && a.level === 'EXCEEDED'
    );
    expect(exceededAlert).toBeDefined();
    expect(exceededAlert.currentPct).toBe(110);
  });
});

describe('BR-09: Anonymized Peer Benchmarking', () => {
  it('should return aggregated anonymized peer cohort data without exposing PII', async () => {
    const res = await request(app)
      .get('/api/v1/budgets/peer-benchmark')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isAnonymized).toBe(true);
    expect(res.body.data.cohortName).toBeDefined();
    expect(res.body.data.cohortAvgSpend).toBeGreaterThan(0);
    expect(res.body.data.categoryBreakdown).toBeInstanceOf(Array);

    // Verify no user-identifying info is exposed in response object
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.name).toBeUndefined();
    expect(res.body.data.phone).toBeUndefined();
  });
});
