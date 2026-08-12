export interface InboundRoutingState {
  duplicate: boolean;
  automationAllowed: boolean;
  ruleOutboxMessageId: string | null;
}

export const shouldRunAiAutomation = (state: InboundRoutingState): boolean =>
  state.automationAllowed && !state.duplicate && state.ruleOutboxMessageId === null;
