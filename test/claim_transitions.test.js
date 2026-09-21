import assert from 'node:assert';
import { claimService } from '../src/services/claim.service.js';

console.log('Running BR-14 state machine transition tests...');

// 1. Valid transitions
assert.strictEqual(claimService.validateStatusTransition('Submitted', 'In Review'), true);
assert.strictEqual(claimService.validateStatusTransition('In Review', 'Approved'), true);
assert.strictEqual(claimService.validateStatusTransition('Approved', 'Reimbursed'), true);
assert.strictEqual(claimService.validateStatusTransition('Submitted', 'Info Requested'), true);
assert.strictEqual(claimService.validateStatusTransition('Info Requested', 'In Review'), true);

// 2. Blocked transition: Rejected -> Reimbursed
try {
  claimService.validateStatusTransition('Rejected', 'Reimbursed');
  assert.fail('Should have blocked Rejected -> Reimbursed');
} catch (err) {
  assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
  console.log('✓ Successfully blocked invalid transition: Rejected -> Reimbursed');
}

// 3. Blocked transition: Rejected -> Approved
try {
  claimService.validateStatusTransition('Rejected', 'Approved');
  assert.fail('Should have blocked Rejected -> Approved');
} catch (err) {
  assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
  console.log('✓ Successfully blocked invalid transition: Rejected -> Approved');
}

// 4. Blocked transition: Reimbursed -> Approved (Terminal state)
try {
  claimService.validateStatusTransition('Reimbursed', 'Approved');
  assert.fail('Should have blocked Reimbursed -> Approved');
} catch (err) {
  assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
  console.log('✓ Successfully blocked invalid transition: Terminal Reimbursed state modification');
}

console.log('ALL BR-14 TRANSITION TESTS PASSED CLEANLY! ✅');
