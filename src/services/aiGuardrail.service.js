export const aiGuardrailService = {
  // Prohibited / Out-of-scope domain keywords (SCRUM-195)
  PROHIBITED_INTENTS: [
    'stock pick',
    'stock tip',
    'crypto buy',
    'invest in bitcoin',
    'tax filing advice',
    'legal counsel',
    'ignore previous instructions',
    'ignore all rules',
    'system prompt',
    'override safety',
    'reveal other user',
    'bypass guardrail',
  ],

  MANDATORY_DISCLAIMER:
    'FinTrack AI provides read-only financial insights based on your synchronized transaction metadata. It does not provide regulated investment, tax, or legal advice.',

  COMPLIANCE_CODE: 'FIN-SAFETY-V1',

  /**
   * SCRUM-195: Ingress Safety & Out-of-Scope Prompt Filter
   */
  filterIngressPrompt: (prompt) => {
    const query = (prompt || '').trim().toLowerCase();

    const isProhibited = aiGuardrailService.PROHIBITED_INTENTS.some((term) =>
      query.includes(term)
    );

    if (isProhibited) {
      return {
        alertTag: 'OUT OF SCOPE SAFETY NOTICE',
        alertSub: 'Compliance Policy',
        intro: 'Safety & Regulatory Policy Filter:',
        reply:
          'FinTrack AI is focused exclusively on analyzing your personal ledger and expense history. I cannot provide stock tips, tax advice, investment picks, or process adversarial override commands.',
        items: [],
        tipBox:
          'For regulated investment or tax planning advice, please consult a certified financial planner.',
        disclaimer: aiGuardrailService.MANDATORY_DISCLAIMER,
        complianceCode: aiGuardrailService.COMPLIANCE_CODE,
        isGrounded: true,
      };
    }

    return null;
  },

  /**
   * SCRUM-195: Egress Anti-Hallucination Sanitizer
   * Verifies that items returned by AI exist within the user's verified grounding transactions.
   */
  sanitizeEgressResponse: (response, groundedTransactions = []) => {
    if (!response) {
      return response;
    }

    // Attach mandatory compliance disclaimer (SCRUM-194)
    response.disclaimer = response.disclaimer || aiGuardrailService.MANDATORY_DISCLAIMER;
    response.complianceCode = response.complianceCode || aiGuardrailService.COMPLIANCE_CODE;
    response.isGrounded = true;

    // If response has items, verify they don't contain hallucinated non-existent transaction data
    if (Array.isArray(response.items) && response.items.length > 0 && groundedTransactions.length > 0) {
      response.items = response.items.filter((item) => {
        if (!item.title) {
          return true;
        }
        // Verify merchant/title or category matches at least one real transaction in context
        const titleLower = item.title.toLowerCase();
        const existsInGrounding = groundedTransactions.some((t) => {
          const tTitle = (t.title || '').toLowerCase();
          const tCat = (t.category || '').toLowerCase();
          return tTitle.includes(titleLower) || titleLower.includes(tTitle) || titleLower.includes(tCat);
        });
        return existsInGrounding;
      });
    }

    return response;
  },
};
