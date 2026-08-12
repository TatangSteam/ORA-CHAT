import { describe, expect, it } from 'vitest';

import {
  cursorPaginationQuerySchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  readinessResponseSchema,
  overviewSchema,
  whatsAppStateSchema
} from './index.js';

describe('cross-application contract boundary', () => {
  it('validates live and ready payloads for process services', () => {
    for (const service of ['api', 'worker', 'whatsapp'] as const) {
      expect(healthResponseSchema.parse({ service, status: 'live' }).service).toBe(service);
      expect(
        readinessResponseSchema.parse({
          service,
          status: 'ready',
          checkedAt: '2026-08-07T00:00:00.000Z'
        }).status
      ).toBe('ready');
    }
  });

  it('shares strict error, pagination, and WhatsApp state vocabulary', () => {
    expect(
      errorEnvelopeSchema.parse({
        error: { code: 'FORBIDDEN', message: 'Ditolak.' },
        meta: { requestId: 'request-1', timestamp: '2026-08-07T00:00:00.000Z' }
      }).error.code
    ).toBe('FORBIDDEN');
    expect(cursorPaginationQuerySchema.parse({ limit: '25' }).limit).toBe(25);
    expect(whatsAppStateSchema.parse('qr_required')).toBe('qr_required');
    expect(() => cursorPaginationQuerySchema.parse({ limit: 25, tenantId: 'attacker' })).toThrow();
    expect(
      overviewSchema.parse({
        dependencies: [],
        sendingPaused: false,
        killSwitch: false,
        riskLevel: 'low',
        metricsAvailable: false,
        metrics: { inbound: 0, outbound: 0, failed: 0, pending: 0, handoffs: 0 },
        lastUpdatedAt: '2026-08-08T00:00:00.000Z',
        degraded: false
      }).metricsAvailable
    ).toBe(false);
  });
});
