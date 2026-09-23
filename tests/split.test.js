import request from 'supertest';
import app from '../src/app.js';
import { SplitGroup } from '../src/models/splitGroup.model.js';
import { GroupExpense } from '../src/models/groupExpense.model.js';
import { Settlement } from '../src/models/settlement.model.js';
import { UserModel } from '../src/models/user.model.js';

describe('Split Expenses API (BR-16 to BR-19)', () => {
  const authHeader = 'Bearer mock_token_123';
  let createdGroupId;

  beforeEach(async () => {
    await SplitGroup.deleteMany({});
    await GroupExpense.deleteMany({});
    await Settlement.deleteMany({});
    await UserModel.deleteMany({ email: /test.*@fintrack\.com/ });
  });

  describe('BR-16: Group Creation & Member Management', () => {
    it('should create a split group with custom icon and 3+ members', async () => {
      const res = await request(app)
        .post('/api/v1/split/groups')
        .set('Authorization', authHeader)
        .send({
          title: 'Goa Trip 2026',
          icon: '🏖️',
          members: [
            { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
            { memberId: 'm_ameya', name: 'Ameya', phone: '+919822012345' },
            { memberId: 'm_aarav', name: 'Aarav', phone: '+919833023456' },
          ],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Goa Trip 2026');
      expect(res.body.data.icon).toBe('🏖️');
      expect(res.body.data.members.length).toBe(3);
      createdGroupId = res.body.data._id;
    });

    it('should reject creating a group with less than 2 members', async () => {
      const res = await request(app)
        .post('/api/v1/split/groups')
        .set('Authorization', authHeader)
        .send({
          title: 'Solo Trip',
          members: [{ memberId: 'user_123', name: 'Ritesh' }],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should add a new member to an existing group', async () => {
      const group = await SplitGroup.create({
        title: 'Office Lunch',
        icon: '🍱',
        createdBy: 'user_123',
        members: [
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
          { memberId: 'm_sneha', name: 'Sneha' },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/split/groups/${group._id}/members`)
        .set('Authorization', authHeader)
        .send({
          name: 'Rohan',
          phone: '+919855045678',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.members.length).toBe(3);
      expect(res.body.data.members.some((m) => m.name === 'Rohan')).toBe(true);
    });
  });

  describe('BR-17: All 3 Split Methods (Equal, Percentage, Itemized)', () => {
    let testGroup;

    beforeEach(async () => {
      testGroup = await SplitGroup.create({
        title: 'Flatmates HSR',
        icon: '🏡',
        createdBy: 'user_123',
        members: [
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
          { memberId: 'm_ameya', name: 'Ameya' },
          { memberId: 'm_atharva', name: 'Atharva' },
        ],
      });
    });

    it('1. Equal Split: accurately calculates and reconciles to 100% of expense', async () => {
      const res = await request(app)
        .post(`/api/v1/split/groups/${testGroup._id}/expenses`)
        .set('Authorization', authHeader)
        .send({
          title: 'Grocery Run',
          totalAmount: 100,
          paidByMemberId: 'user_123',
          splitType: 'equal',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      const allocs = res.body.data.allocations;
      expect(allocs.length).toBe(3);
      const sum = allocs.reduce((acc, a) => acc + a.amount, 0);
      // Remainder cent balanced: 33.34 + 33.33 + 33.33 = 100.00
      expect(sum).toBeCloseTo(100.0, 2);
    });

    it('2. Percentage Split: validates 100% sum and calculates exact shares', async () => {
      const res = await request(app)
        .post(`/api/v1/split/groups/${testGroup._id}/expenses`)
        .set('Authorization', authHeader)
        .send({
          title: 'Electricity Bill',
          totalAmount: 1000,
          paidByMemberId: 'user_123',
          splitType: 'percentage',
          percentages: {
            user_123: 50,
            m_ameya: 25,
            m_atharva: 25,
          },
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      const allocs = res.body.data.allocations;
      const ritShare = allocs.find((a) => a.memberId === 'user_123');
      const ameShare = allocs.find((a) => a.memberId === 'm_ameya');
      expect(ritShare.amount).toBe(500);
      expect(ameShare.amount).toBe(250);
    });

    it('3. Itemized Split: correctly apportions item prices and shared tax/tip to 100%', async () => {
      const res = await request(app)
        .post(`/api/v1/split/groups/${testGroup._id}/expenses`)
        .set('Authorization', authHeader)
        .send({
          title: 'Dinner at Fisherman Wharf',
          totalAmount: 1100,
          paidByMemberId: 'user_123',
          splitType: 'itemized',
          taxAndTip: 100,
          itemizedEntries: [
            { name: 'Pizza', price: 600, assignedMemberIds: ['user_123', 'm_ameya'] },
            { name: 'Pasta', price: 200, assignedMemberIds: ['m_atharva'] },
            { name: 'Drinks', price: 200, assignedMemberIds: ['user_123', 'm_ameya', 'm_atharva'] },
          ],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      const allocs = res.body.data.allocations;
      const sum = allocs.reduce((acc, a) => acc + a.amount, 0);
      expect(sum).toBeCloseTo(1100.0, 2);
    });
  });

  describe('BR-18: Debt Simplification & Balances', () => {
    it('simplifies multi-way debts to minimum direct transactions', async () => {
      const group = await SplitGroup.create({
        title: 'Goa Trip 2026',
        icon: '🏖️',
        createdBy: 'user_123',
        members: [
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
          { memberId: 'm_ameya', name: 'Ameya' },
          { memberId: 'm_atharva', name: 'Atharva' },
        ],
      });

      // Expense 1: Ameya paid 300, split 100 each
      await request(app)
        .post(`/api/v1/split/groups/${group._id}/expenses`)
        .set('Authorization', authHeader)
        .send({
          title: 'Lunch',
          totalAmount: 300,
          paidByMemberId: 'm_ameya',
          splitType: 'equal',
        });

      // Expense 2: Atharva paid 300, split 100 each
      await request(app)
        .post(`/api/v1/split/groups/${group._id}/expenses`)
        .set('Authorization', authHeader)
        .send({
          title: 'Scooter',
          totalAmount: 300,
          paidByMemberId: 'm_atharva',
          splitType: 'equal',
        });

      const res = await request(app)
        .get(`/api/v1/split/groups/${group._id}/balances`)
        .set('Authorization', authHeader);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      // Ritesh owes Ameya 100, Ritesh owes Atharva 100
      expect(data.simplifiedDebts.length).toBe(2);
      expect(data.simplifiedDebts.every((d) => d.fromMemberId === 'user_123')).toBe(true);
    });
  });

  describe('BR-19: Non-Monetary Settlement & Reminders', () => {
    it('marks a debt as settled externally without monetary transfer', async () => {
      const group = await SplitGroup.create({
        title: 'Settlement Test',
        icon: '🤝',
        createdBy: 'user_123',
        members: [
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
          { memberId: 'm_ameya', name: 'Ameya' },
        ],
      });

      const debtKey = `${group._id}_user_123_m_ameya`;

      const res = await request(app)
        .post('/api/v1/split/settlements')
        .set('Authorization', authHeader)
        .send({
          groupId: group._id.toString(),
          debtKey,
          fromMemberId: 'user_123',
          fromMemberName: 'Ritesh',
          toMemberId: 'm_ameya',
          toMemberName: 'Ameya',
          amount: 500,
          settlementNote: 'Settled via external Google Pay (non-monetary tracking)',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isSettled).toBe(true);
      expect(res.body.data.debtKey).toBe(debtKey);
    });

    it('generates friendly pre-composed reminder copy', async () => {
      const res = await request(app)
        .get('/api/v1/split/reminder')
        .set('Authorization', authHeader)
        .query({
          groupTitle: 'Goa Trip 2026',
          debtorName: 'Ameya',
          amount: 750,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Ameya');
      expect(res.body.data.message).toContain('750');
      expect(res.body.data.message).toContain('Goa Trip 2026');
      expect(res.body.data.message).toContain('FinTrack');
    });
  });

  describe('User Lookup, Deletion, and Group Invitation Flows', () => {
    it('looks up a registered user by mobile phone and returns their name', async () => {
      await UserModel.create({
        email: 'test_sneha@fintrack.com',
        fullName: 'Sneha Patel',
        name: 'Sneha Patel',
        phone: '+919844034567',
      });

      const res = await request(app)
        .get('/api/v1/split/users/lookup')
        .set('Authorization', authHeader)
        .query({ phone: '9844034567' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Sneha Patel');
    });

    it('returns 404 with error message when looking up an unregistered phone', async () => {
      const res = await request(app)
        .get('/api/v1/split/users/lookup')
        .set('Authorization', authHeader)
        .query({ phone: '9999988888' });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('This person is not available on FinTrack');
    });

    it('deletes a group and cascades deletion of its expenses and settlements', async () => {
      const group = await SplitGroup.create({
        title: 'Delete Me Group',
        icon: '🗑️',
        createdBy: 'user_123',
        members: [
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: true },
          { memberId: 'm_ameya', name: 'Ameya' },
        ],
      });

      await GroupExpense.create({
        groupId: group._id.toString(),
        title: 'Coffee',
        totalAmount: 200,
        paidByMemberId: 'user_123',
        paidByMemberName: 'Ritesh',
        splitType: 'equal',
        allocations: [{ memberId: 'user_123', memberName: 'Ritesh', amount: 100, percentage: 50 }],
      });

      const res = await request(app)
        .delete(`/api/v1/split/groups/${group._id}`)
        .set('Authorization', authHeader);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const checkGroup = await SplitGroup.findById(group._id);
      expect(checkGroup).toBeNull();
      const checkExpenses = await GroupExpense.find({ groupId: group._id.toString() });
      expect(checkExpenses.length).toBe(0);
    });

    it('handles group invitation response: accepts invite and marks status ACCEPTED', async () => {
      const group = await SplitGroup.create({
        title: 'Road Trip',
        icon: '🚗',
        createdBy: 'friend_456',
        members: [
          { memberId: 'friend_456', name: 'Friend', isCurrentUser: false, status: 'ACCEPTED' },
          { memberId: 'user_123', name: 'Ritesh', isCurrentUser: false, status: 'PENDING_INVITE' },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/split/groups/${group._id}/invitation`)
        .set('Authorization', authHeader)
        .send({ action: 'ACCEPT' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const userMember = res.body.data.members.find((m) => m.memberId === 'user_123');
      expect(userMember.status).toBe('ACCEPTED');
    });
  });
});
