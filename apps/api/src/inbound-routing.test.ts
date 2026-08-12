import { describe, expect, it } from 'vitest';

import { shouldRunAiAutomation } from './inbound-routing.js';

describe('inbound automation routing', () => {
  it('runs AI only for a new bot-mode inbound without a deterministic response', () => {
    expect(
      shouldRunAiAutomation({
        automationAllowed: true,
        duplicate: false,
        ruleOutboxMessageId: null
      })
    ).toBe(true);
  });

  it.each([
    { automationAllowed: false, duplicate: false, ruleOutboxMessageId: null },
    { automationAllowed: true, duplicate: true, ruleOutboxMessageId: null },
    {
      automationAllowed: true,
      duplicate: false,
      ruleOutboxMessageId: '019ff0c7-e823-7ab0-9f7e-3bd90e280047'
    }
  ])('does not run AI when automation is blocked or already handled', (state) => {
    expect(shouldRunAiAutomation(state)).toBe(false);
  });
});
