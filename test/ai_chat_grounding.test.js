import assert from 'node:assert';
import { aiService } from '../src/services/ai.service.js';

console.log('Running SCRUM-174 AI Grounding & Chat Intent Verification Tests...');

async function runTests() {
  // Test 1: Category Overspend Query Intent & Grounding
  const result1 = await aiService.processChatQuery('user_test_1', 'Where did I overspend this month?');
  assert.strictEqual(typeof result1.intro, 'string');
  assert.strictEqual(typeof result1.reply, 'string');
  assert.ok(result1.alertTag.includes('SPEND') || result1.alertTag.includes('INSIGHT'));
  console.log('✓ SCRUM-171/172 Intent & Data Grounding Test 1 Passed:', result1.alertTag);

  // Test 2: Subscriptions Query Intent
  const result2 = await aiService.processChatQuery('user_test_1', 'What subscriptions do I have active?');
  assert.strictEqual(result2.alertTag, 'RECURRING COMMITMENTS');
  assert.ok(result2.items.length > 0);
  console.log('✓ SCRUM-171 Intent Handling Test 2 (Subscriptions) Passed:', result2.alertTag);

  // Test 3: Reimbursement Claims Query Intent
  const result3 = await aiService.processChatQuery('user_test_1', 'Show all reimbursable receipts and claims');
  assert.strictEqual(result3.alertTag, 'REIMBURSEMENT AUDIT');
  console.log('✓ SCRUM-171/172 Intent Handling Test 3 (Claims) Passed:', result3.alertTag);

  // Test 4: Savings Goal Query Intent
  const result4 = await aiService.processChatQuery('user_test_1', 'How can I reach my 10000 monthly savings goal?');
  assert.strictEqual(result4.alertTag, 'SAVINGS GOAL TRACKER');
  console.log('✓ SCRUM-171/172 Intent Handling Test 4 (Savings Goal) Passed:', result4.alertTag);

  console.log('ALL SCRUM-174 AI CHAT & GROUNDING TESTS PASSED CLEANLY! ✅');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
