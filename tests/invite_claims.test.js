import { employerService } from '../src/services/employer.service.js';
import { claimService } from '../src/services/claim.service.js';
import { InviteCodeModel } from '../src/models/inviteCode.model.js';
import { EmployerModel } from '../src/models/employer.model.js';
import { ClaimModel } from '../src/models/claim.model.js';

beforeEach(async () => {
  await InviteCodeModel.deleteMany({});
  await EmployerModel.deleteMany({});
  await ClaimModel.deleteMany({});
});

describe('Enterprise Invite Code & Claim Reimbursement Lifecycle', () => {
  test('1. Employer generates unique invite code with department & allowance', async () => {
    const invite = await employerService.generateInviteCode({
      companyId: 'COMP-TECHCORP-01',
      companyName: 'TechCorp Solutions India',
      department: 'Engineering',
      monthlyAllowance: 35000,
      role: 'Backend Architect',
      createdBy: 'Admin Ritesh',
    });

    expect(invite).toBeDefined();
    expect(invite.code).toMatch(/^[A-Z0-9]{2,4}-\d{4}-[A-Z0-9]{2}$/);
    expect(invite.companyName).toBe('TechCorp Solutions India');

    expect(invite.department).toBe('Engineering');
    expect(invite.monthlyAllowance).toBe(35000);
    expect(invite.status).toBe('ACTIVE');
  });

  test('2. Employee verifies valid invite code before joining', async () => {
    const created = await employerService.generateInviteCode({
      companyId: 'COMP-TECHCORP-01',
      companyName: 'TechCorp Solutions India',
      department: 'Finance',
      monthlyAllowance: 20000,
    });

    const verification = await employerService.verifyInviteCode(created.code);
    expect(verification.valid).toBe(true);
    expect(verification.code).toBe(created.code);
    expect(verification.companyName).toBe('TechCorp Solutions India');
    expect(verification.department).toBe('Finance');
    expect(verification.monthlyAllowance).toBe(20000);
  });

  test('3. Unlinked user cannot submit claims before joining organization', async () => {
    await expect(
      claimService.submitClaim('unlinked_user_99', {
        title: 'Cab ride to airport',
        amount: 850,
        category: 'Travel & Transport',
        project: 'Project Alpha',
        costCenter: 'CC-102',
      })
    ).rejects.toThrow('You must join your organization via an invite code');
  });

  test('4. Employee claims code and joins organization successfully', async () => {
    const created = await employerService.generateInviteCode({
      companyId: 'COMP-TECHCORP-01',
      companyName: 'TechCorp Solutions India',
      department: 'Engineering',
      monthlyAllowance: 30000,
    });

    const result = await employerService.claimInviteCode('emp_user_1', created.code, {
      name: 'Aniket Sharma',
      email: 'aniket@techcorp.in',
      phone: '+91 98765 43210',
    });

    expect(result.success).toBe(true);
    expect(result.linkedEmployer.employerName).toBe('TechCorp Solutions India');
    expect(result.linkedEmployer.department).toBe('Engineering');
    expect(result.linkedEmployer.monthlyAllowance).toBe(30000);

    // Verify code marked as CLAIMED
    const updatedCode = await InviteCodeModel.findOne({ code: created.code });
    expect(updatedCode.status).toBe('CLAIMED');
    expect(updatedCode.claimedBy.name).toBe('Aniket Sharma');
  });

  test('5. Claimed code cannot be used by a second employee', async () => {
    const created = await employerService.generateInviteCode({
      companyId: 'COMP-TECHCORP-01',
      companyName: 'TechCorp Solutions India',
    });

    await employerService.claimInviteCode('emp_user_1', created.code, {
      name: 'First Employee',
      email: 'first@techcorp.in',
    });

    await expect(
      employerService.claimInviteCode('emp_user_2', created.code, {
        name: 'Second Employee',
        email: 'second@techcorp.in',
      })
    ).rejects.toThrow('This invite code has already been claimed');
  });

  test('6. Joined employee submits claim -> Employer Approves -> Employer Marks Payment Done', async () => {
    // A. Join company
    const created = await employerService.generateInviteCode({
      companyId: 'COMP-TECHCORP-01',
      companyName: 'TechCorp Solutions India',
      department: 'Product & Design',
      monthlyAllowance: 25000,
    });

    await employerService.claimInviteCode('emp_user_3', created.code, {
      name: 'Ritesh Jadhav',
      email: 'ritesh@techcorp.in',
    });

    // B. Submit claim
    const claim = await claimService.submitClaim('emp_user_3', {
      title: 'Uber Premier Client Meeting',
      amount: 450,
      category: 'Travel & Transport',
      project: 'Client Meeting Q3',
      costCenter: 'CC-300-ENG',
      billId: 'bill_receipt_123',
    });

    expect(claim).toBeDefined();
    expect(claim.status).toBe('Submitted');
    expect(claim.employerName).toBe('TechCorp Solutions India');

    // C. Employer Reviews & Approves claim
    const approved = await claimService.updateClaimStatus(claim.claimId, {
      status: 'Approved',
      adminNotes: 'Uber receipt verified via AI OCR. Within daily policy cap.',
      reviewerId: 'Finance Admin',
    });

    expect(approved.status).toBe('Approved');
    expect(approved.adminNotes).toContain('Within daily policy cap');

    // D. Employer Disburses Payment & Marks Payment Done ('Paid')
    const paid = await claimService.updateClaimStatus(claim.claimId, {
      status: 'Paid',
      adminNotes: 'Payout processed via Corporate UPI (UTR: UPI-984210492)',
      reviewerId: 'Payroll Lead',
    });

    expect(paid.status).toBe('Paid');
    expect(paid.adminNotes).toContain('UTR: UPI-984210492');
  });
});
