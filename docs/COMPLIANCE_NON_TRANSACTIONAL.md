# FinTrack AI: Non-Transactional Boundary Compliance Specification

**Document Version:** 1.0.0  
**Status:** Approved & Verified (SCRUM-162)  
**System:** FinTrack AI Enterprise & Mobile Platform  
**Architecture Classification:** Non-Custodial Financial Information Utility & Expense Ledger  

---

## 1. Executive Summary & Purpose

FinTrack AI is an intelligent personal finance tracking, receipt OCR, group bill splitting, and corporate reimbursement approval ecosystem.

This document formally certifies that **FinTrack AI does NOT possess, facilitate, or execute any automated fund movements, bank wire payouts, automated debits, or customer money custody**. 

By maintaining a strict **Non-Transactional Boundary**, FinTrack AI complies with the **Reserve Bank of India (RBI) Payment and Settlement Systems Act, 2007**, RBI Guidelines for Payment Aggregators (PA) and Payment Gateways (PG), and international standards (ISO 27001, SOC 2 Type II) by operating exclusively as an **Information Utility and Accounting Ledger**, completely exempt from Payment Aggregator licensing requirements.

---

## 2. Non-Custodial Architecture & Zero-Fund Custody Model

```text
[ FinTrack AI Ecosystem ]                       [ Real World Banking & Funds ]
┌───────────────────────────┐                   ┌─────────────────────────────┐
│ Mobile App (Flutter)      │                   │ User's Bank Account         │
│ • OCR Receipt Scanner     │                   │ • HDFC / ICICI / SBI / Axis │
│ • Statement Ingestion     │                   └──────────────┬──────────────┘
│ • Split Debt Ledger       │                                  │
│ • Expense Categorization  │                                  │ Direct UPI Intent
└─────────────┬─────────────┘                                  │ (Outside FinTrack)
              │                                                ▼
              ▼                                 ┌─────────────────────────────┐
┌───────────────────────────┐                   │ User's UPI App (3rd-Party)  │
│ Backend API (Express.js)  │                   │ • GPay / PhonePe / Paytm    │
│ • Tamper-Evident Ledger   │                   └─────────────────────────────┘
│ • Claim Status Machine    │                                  
│ • Non-Transactional Guard │                                  
└─────────────┬─────────────┘                   ┌─────────────────────────────┐
              │                                 │ Corporate Payroll / Banking │
              ▼                                 │ • Direct salary disbursement│
┌───────────────────────────┐                   │ • Net banking reimbursement │
│ Employer Web Dashboard    │                   └──────────────▲──────────────┘
│ • Review OCR Receipts     │                                  │ Offline Processing
│ • Approve / Reject Claims ├──────────────────────────────────┘ (No in-app API wire)
└───────────────────────────┘
```

### Key Architectural Tenets:
1. **Zero Balance Custody:** FinTrack AI holds ₹0.00 of user or corporate funds at all times. There are no digital wallets, escrow accounts, or pooled nodal accounts.
2. **Non-Monetary Split Ledger:** Group bill splitting and debt settlements operate purely as a mathematical double-entry tracker. When a debt is marked settled, it records an external settlement confirmation (`"Settled via external UPI/Cash"`).
3. **Offline Corporate Reimbursement:** When a manager approves a corporate claim (`status: "Approved"`), the system stamps `settlementMethod: "OFFLINE_PAYROLL_EXTERNAL"` and `isFundMovementPrevented: true`. No API calls are made to banking or payment gateway payout endpoints. Payouts are handled via existing corporate payroll cycles.
4. **Third-Party UPI Hand-Off:** Any payment link generated uses standard client-side URI schemes (`upi://pay`) that hand off payment execution to authorized NPCI/RBI banking applications on the user's device. FinTrack AI never sees banking credentials, MPINs, or account balances.

---

## 3. Technical Safeguards & Boundary Controls (SCRUM-161)

| Control Layer | Safeguard Implementation | Action on Violation |
| :--- | :--- | :--- |
| **Network & Middleware** | `nonTransactionalSafeguard` ([safeguard.middleware.js](../src/middlewares/safeguard.middleware.js)) intercepts all HTTP requests. | Rejects with **HTTP 403 Forbidden** (`NON_TRANSACTIONAL_VIOLATION`) and logs a tamper-evident audit event. |
| **Forbidden Key Inspection** | Recursively scans payloads for payout parameters (`payoutMethod`, `beneficiaryAccount`, `beneficiaryIfsc`, `initiateTransfer`, `autoDebitMandate`, `disburseFunds`, `paymentGatewaySecret`, etc.). | Parameter rejection; prevents payout payload injection. |
| **Dependency Lock** | [package.json](../package.json) is audited to enforce zero payment gateway payout SDKs (Razorpay, Stripe, Cashfree, PayPal, Dwolla). | Automated test failure in CI/CD pipeline if payout SDK is introduced. |
| **Domain State Machine** | [claim.service.js](../src/services/claim.service.js) explicitly stamps `settlementMethod: 'OFFLINE_PAYROLL_EXTERNAL'` and `isFundMovementPrevented: true` upon approval. | Enforces that claim approval is strictly an accounting approval, not a payout trigger. |
| **Cryptographic Audit Trail** | [audit.service.js](../src/services/audit.service.js) records all state changes in an immutable SHA-256 hash-chained log. | Non-repudiation and forensic auditability. |

---

## 4. Regulatory Mapping Matrix

| Regulation / Framework | Regulatory Mandate | FinTrack AI Compliance Architecture |
| :--- | :--- | :--- |
| **RBI Payment & Settlement Systems Act, 2007** | Entity handling customer funds or settling transactions requires authorization as a Payment System Operator (PSO) or Payment Aggregator (PA). | **Exempt:** FinTrack AI does not handle, clear, or settle funds. It is an information utility / record-keeping software. |
| **RBI Master Directions on Digital Lending** | Disbursal of loans and repayments must execute directly between borrower and regulated entity bank accounts without intermediary pooling. | **Compliant:** No pooling accounts exist; all settlements occur directly between individuals or via enterprise corporate payroll. |
| **Digital Personal Data Protection (DPDP) Act, 2023** | Explicit consent required for financial and personal data processing. | **Compliant:** Granular DPDP consent service ([consent.service.js](../src/services/consent.service.js)) logs consent grant and revocation in tamper-evident audit logs. |
| **App Store Financial Guidelines (Apple & Google)** | Financial apps offering money transfer must hold banking or money transmitter licenses. | **Compliant:** Clearly documented as an expense ledger and bill scanner with non-transactional boundary safeguards. |

---

## 5. Verification & Continuous Compliance (SCRUM-160)

FinTrack AI includes automated test verification suite ([non_transactional.test.js](../../tests/non_transactional.test.js)) running on every build:
1. **Dependency Audit Test:** Asserts zero payment gateway SDKs exist in production or development dependencies.
2. **Route Pattern Audit Test:** Asserts that none of the registered Express route paths contain `/payout`, `/disburse`, `/wire`, `/charge`, or `/withdraw`.
3. **Runtime Interception Test:** Verifies that attempting to send banking payout or auto-debit payloads returns HTTP 403 Forbidden with security audit logging.
4. **State Machine Stamp Test:** Verifies that approved corporate claims are stamped with `OFFLINE_PAYROLL_EXTERNAL` and fund-movement prevention flags.

---

*Certified by:* FinTrack AI Architecture & Compliance Team  
*Date of Enforcement:* September 2026
