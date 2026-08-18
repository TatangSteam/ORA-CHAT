import { createHash } from 'node:crypto';

import type {
  AiExpectedBehavior,
  AiFeedback,
  AiReadinessDecision,
  AiReadinessEvaluate,
  AiTestCaseCreate,
  UnansweredDraft
} from '@raho/contracts';
import { generateUuidV7, Prisma, type PrismaClient } from '@raho/db';

const safeJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

const auditData = (
  tenantId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  requestId: string,
  metadata: Record<string, unknown> = {}
) => ({
  id: generateUuidV7(),
  tenantId,
  actorUserId,
  action,
  entityType,
  entityId,
  reason,
  requestId,
  metadata: safeJson(metadata)
});

export type OperationsResult<T> =
  { status: 'ok'; value: T } | { status: 'not_found' | 'invalid_state' | 'revision_conflict' };

export interface EvaluatedAnswer {
  id: string;
  status: 'answered' | 'fallback' | 'handoff';
  answer: string;
  sources: Array<{ id: string }>;
  latencyMs: number;
}

const assertAnswer = (answer: EvaluatedAnswer, expected: AiExpectedBehavior) => {
  const checks = {
    status: answer.status === expected.status,
    citation: !expected.requireCitation || answer.sources.length > 0,
    latency: answer.latencyMs <= expected.maxLatencyMs,
    forbiddenTerms: expected.forbiddenTerms.every(
      (term) => !answer.answer.toLocaleLowerCase('id-ID').includes(term.toLocaleLowerCase('id-ID'))
    )
  };
  return { passed: Object.values(checks).every(Boolean), checks };
};

export class PrismaAiOperationsRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async saveFeedback(
    tenantId: string,
    actorUserId: string,
    traceId: string,
    input: AiFeedback,
    requestId: string
  ): Promise<OperationsResult<unknown>> {
    const trace = await this.prisma.aiMessageTrace.findFirst({
      where: { id: traceId, tenantId },
      select: { id: true }
    });
    if (!trace) return { status: 'not_found' };
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.aiAdminFeedback.findUnique({
        where: { traceId_reviewerUserId: { traceId, reviewerUserId: actorUserId } }
      });
      const feedback = await tx.aiAdminFeedback.upsert({
        where: { traceId_reviewerUserId: { traceId, reviewerUserId: actorUserId } },
        create: {
          id: generateUuidV7(),
          tenantId,
          traceId,
          reviewerUserId: actorUserId,
          rating: input.rating,
          category: input.category,
          note: input.note
        },
        update: { rating: input.rating, category: input.category, note: input.note }
      });
      await tx.auditLog.create({
        data: auditData(
          tenantId,
          actorUserId,
          previous ? 'ai.feedback.revised' : 'ai.feedback.created',
          'AiAdminFeedback',
          feedback.id,
          input.reason,
          requestId,
          {
            traceId,
            previous: previous
              ? { rating: previous.rating, category: previous.category, note: previous.note }
              : null,
            current: { rating: feedback.rating, category: feedback.category, note: feedback.note }
          }
        )
      });
      return { status: 'ok' as const, value: feedback };
    });
  }

  public listUnanswered(tenantId: string, status?: string, limit = 50) {
    return this.prisma.unansweredQuestion.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { _count: { select: { occurrences: true } } },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }, { id: 'desc' }],
      take: limit
    });
  }

  public async createDraftFromUnanswered(
    tenantId: string,
    actorUserId: string,
    unansweredId: string,
    input: UnansweredDraft,
    requestId: string
  ): Promise<OperationsResult<unknown>> {
    const question = await this.prisma.unansweredQuestion.findFirst({
      where: { id: unansweredId, tenantId }
    });
    if (!question) return { status: 'not_found' };
    if (question.status !== 'open') return { status: 'invalid_state' };
    if (input.categoryId) {
      const category = await this.prisma.knowledgeCategory.findFirst({
        where: { id: input.categoryId, tenantId },
        select: { id: true }
      });
      if (!category) return { status: 'not_found' };
    }
    return this.prisma.$transaction(async (tx) => {
      const itemId = generateUuidV7();
      const versionId = generateUuidV7();
      await tx.knowledgeItem.create({
        data: {
          id: itemId,
          tenantId,
          categoryId: input.categoryId,
          title: input.title,
          currentVersionId: null
        }
      });
      await tx.knowledgeItemVersion.create({
        data: {
          id: versionId,
          tenantId,
          itemId,
          version: 1,
          answer: input.answer,
          contentHash: hash(input.answer),
          createdByUserId: actorUserId,
          questionVariants: {
            create: {
              id: generateUuidV7(),
              tenantId,
              question: question.representativeQuestion,
              normalizedQuestion: question.representativeQuestion
                .normalize('NFKC')
                .trim()
                .toLocaleLowerCase('id-ID')
                .replace(/\s+/gu, ' ')
            }
          }
        }
      });
      await tx.knowledgeItem.update({
        where: { id: itemId },
        data: { currentVersionId: versionId }
      });
      const value = await tx.unansweredQuestion.update({
        where: { id: unansweredId },
        data: { status: 'drafted', resolvedByItemId: itemId, resolvedAt: this.now() }
      });
      await tx.auditLog.create({
        data: auditData(
          tenantId,
          actorUserId,
          'ai.unanswered.drafted',
          'UnansweredQuestion',
          unansweredId,
          input.reason,
          requestId,
          { itemId }
        )
      });
      return { status: 'ok' as const, value };
    });
  }

  public listTestCases(tenantId: string) {
    return this.prisma.aiTestCase.findMany({
      where: { tenantId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });
  }

  public async createTestCases(
    tenantId: string,
    actorUserId: string,
    inputs: AiTestCaseCreate[],
    reason: string,
    requestId: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const input of inputs) {
        const testCase = await tx.aiTestCase.upsert({
          where: { tenantId_name: { tenantId, name: input.name } },
          create: {
            id: generateUuidV7(),
            tenantId,
            name: input.name,
            input: input.input,
            expectedBehavior: safeJson(input.expectedBehavior),
            createdByUserId: actorUserId
          },
          update: { input: input.input, expectedBehavior: safeJson(input.expectedBehavior) }
        });
        created.push(testCase);
      }
      await tx.auditLog.create({
        data: auditData(
          tenantId,
          actorUserId,
          'ai.test_cases.imported',
          'AiTestCase',
          hash(created.map(({ id }) => id).join(',')),
          reason,
          requestId,
          { count: created.length }
        )
      });
      return created;
    });
  }

  public async runTestCases(
    tenantId: string,
    actorUserId: string,
    ids: string[],
    reason: string,
    requestId: string,
    answer: (question: string, requestId: string) => Promise<EvaluatedAnswer>
  ): Promise<OperationsResult<unknown>> {
    const [cases, integration] = await Promise.all([
      this.prisma.aiTestCase.findMany({ where: { tenantId, id: { in: ids }, status: 'active' } }),
      this.prisma.aiIntegration.findFirst({ where: { tenantId, name: 'default' } })
    ]);
    if (!integration || cases.length !== new Set(ids).size) return { status: 'not_found' };
    const values = [];
    for (const testCase of cases) {
      const startedAt = this.now();
      try {
        const actual = await answer(testCase.input, `${requestId}:${testCase.id}`);
        const assertion = assertAnswer(
          actual,
          testCase.expectedBehavior as unknown as AiExpectedBehavior
        );
        values.push(
          await this.prisma.aiTestRun.create({
            data: {
              id: generateUuidV7(),
              tenantId,
              testCaseId: testCase.id,
              integrationId: integration.id,
              status: assertion.passed ? 'passed' : 'failed',
              actualResult: safeJson({
                traceId: actual.id,
                status: actual.status,
                citations: actual.sources.length
              }),
              assertionResult: safeJson(assertion),
              latencyMs: actual.latencyMs,
              startedAt,
              finishedAt: this.now()
            }
          })
        );
      } catch {
        values.push(
          await this.prisma.aiTestRun.create({
            data: {
              id: generateUuidV7(),
              tenantId,
              testCaseId: testCase.id,
              integrationId: integration.id,
              status: 'error',
              actualResult: safeJson({ code: 'SAFE_EXECUTION_ERROR' }),
              assertionResult: safeJson({ passed: false }),
              latencyMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
              startedAt,
              finishedAt: this.now()
            }
          })
        );
      }
    }
    await this.prisma.auditLog.create({
      data: auditData(
        tenantId,
        actorUserId,
        'ai.test_run.completed',
        'AiTestRun',
        hash(values.map(({ id }) => id).join(',')),
        reason,
        requestId,
        { total: values.length, passed: values.filter(({ status }) => status === 'passed').length }
      )
    });
    return { status: 'ok', value: values };
  }

  public async analytics(tenantId: string, days: number) {
    const since = new Date(this.now().getTime() - days * 86_400_000);
    const [
      traces,
      handoffs,
      unanswered,
      queue,
      usage,
      feedback,
      tokenTotals,
      providerRequests,
      meteredRequests
    ] = await Promise.all([
      this.prisma.aiMessageTrace.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: {
          status: true,
          provider: true,
          latencyMs: true,
          inputTokens: true,
          outputTokens: true,
          cachedTokens: true,
          costMinor: true,
          costCurrency: true,
          cacheHit: true,
          fallbackReason: true
        },
        take: 10_000
      }),
      this.prisma.handoffTask.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.unansweredQuestionOccurrence.count({
        where: { tenantId, occurredAt: { gte: since } }
      }),
      this.prisma.outboxMessage.findMany({
        where: { tenantId, status: { in: ['queued', 'retryable', 'leased'] } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 1
      }),
      this.prisma.aiEmbeddingUsageLog.aggregate({
        where: { tenantId, createdAt: { gte: since } },
        _sum: { itemCount: true, tokenCount: true }
      }),
      this.prisma.aiAdminFeedback.groupBy({
        by: ['category'],
        where: { tenantId, updatedAt: { gte: since } },
        _count: true
      }),
      this.prisma.aiMessageTrace.aggregate({
        where: { tenantId, createdAt: { gte: since }, provider: { not: null } },
        _sum: { inputTokens: true, outputTokens: true, cachedTokens: true }
      }),
      this.prisma.aiMessageTrace.count({
        where: { tenantId, createdAt: { gte: since }, provider: { not: null } }
      }),
      this.prisma.aiMessageTrace.count({
        where: {
          tenantId,
          createdAt: { gte: since },
          provider: { not: null },
          OR: [{ inputTokens: { not: null } }, { outputTokens: { not: null } }]
        }
      })
    ]);
    const total = traces.length;
    const answered = traces.filter(({ status }) => status === 'answered').length;
    const fallback = traces.filter(({ status }) => status === 'fallback').length;
    const latency = traces.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
    const providers = Object.entries(
      traces.reduce<Record<string, { requests: number; failures: number; latencyMs: number }>>(
        (result, trace) => {
          const key = trace.provider ?? 'none';
          result[key] ??= { requests: 0, failures: 0, latencyMs: 0 };
          result[key].requests += 1;
          result[key].latencyMs += trace.latencyMs;
          if (trace.status !== 'answered') result[key].failures += 1;
          return result;
        },
        {}
      )
    ).map(([provider, value]) => ({
      provider,
      requests: value.requests,
      errors: value.failures,
      averageLatencyMs: Math.round(value.latencyMs / value.requests)
    }));
    const inputTokens = tokenTotals._sum.inputTokens ?? 0;
    const outputTokens = tokenTotals._sum.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    return {
      windowDays: days,
      total,
      answered,
      answerRate: total ? answered / total : 0,
      supportedRate: total ? (total - fallback) / total : 0,
      fallback,
      handoffs,
      unanswered,
      latencyP50Ms: latency[Math.floor(latency.length * 0.5)] ?? 0,
      latencyP95Ms: latency[Math.min(latency.length - 1, Math.floor(latency.length * 0.95))] ?? 0,
      inputTokens,
      outputTokens,
      totalTokens,
      cachedTokens: tokenTotals._sum.cachedTokens ?? 0,
      providerRequests,
      meteredRequests,
      usageCoverageRate: providerRequests ? meteredRequests / providerRequests : 1,
      averageTokensPerRequest: meteredRequests ? Math.round(totalTokens / meteredRequests) : 0,
      cacheHits: traces.filter(({ cacheHit }) => cacheHit).length,
      estimatedCost: traces.reduce((sum, row) => sum + (row.costMinor ?? 0), 0),
      costCurrency: traces.find(({ costCurrency }) => costCurrency)?.costCurrency ?? 'USD',
      embeddingItems: usage._sum.itemCount ?? 0,
      embeddingTokens: usage._sum.tokenCount ?? 0,
      oldestQueueAgeMs: queue[0]
        ? Math.max(0, this.now().getTime() - queue[0].createdAt.getTime())
        : 0,
      providers,
      feedback: feedback.map((row) => ({ category: row.category, count: row._count }))
    };
  }

  public listReadiness(tenantId: string) {
    return this.prisma.aiReleaseReadiness.findMany({
      where: { tenantId },
      include: { reports: { orderBy: { createdAt: 'desc' } } },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: 20
    });
  }

  private async hasLexicalSources(tenantId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ available: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM knowledge_lexical_chunks c
        LEFT JOIN knowledge_documents d
          ON d.id = c.document_id AND d.tenant_id = c.tenant_id
        LEFT JOIN knowledge_item_versions v
          ON v.id = c.item_version_id AND v.tenant_id = c.tenant_id
        LEFT JOIN knowledge_items i
          ON i.id = v.item_id AND i.tenant_id = c.tenant_id
        WHERE c.tenant_id = ${tenantId}::uuid
          AND (
            (c.document_id IS NOT NULL AND d.state = 'ready') OR
            (c.item_version_id IS NOT NULL AND i.status = 'published'
             AND i.published_version_id = v.id AND v.status = 'published')
          )
      ) AS available
    `);
    return rows[0]?.available ?? false;
  }

  private async refreshAlerts(tenantId: string) {
    const since = new Date(this.now().getTime() - 3_600_000);
    const [oldestQueue, traces, integration, lexicalSourcesAvailable] = await Promise.all([
      this.prisma.outboxMessage.findFirst({
        where: { tenantId, status: { in: ['queued', 'retryable', 'leased'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      }),
      this.prisma.aiMessageTrace.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { status: true }
      }),
      this.prisma.aiIntegration.findFirst({
        where: { tenantId, name: 'default' },
        include: { activeChatConnection: true, activeEmbeddingConnection: true }
      }),
      this.hasLexicalSources(tenantId)
    ]);
    const alerts: Array<{
      code: string;
      severity: 'warning' | 'critical';
      summary: string;
      metadata: Record<string, unknown>;
    }> = [];
    const queueAgeMs = oldestQueue ? this.now().getTime() - oldestQueue.createdAt.getTime() : 0;
    if (queueAgeMs > 60_000) {
      alerts.push({
        code: 'OUTBOX_QUEUE_AGE',
        severity: queueAgeMs > 300_000 ? 'critical' : 'warning',
        summary: 'Usia antrean outbox melewati ambang operasional.',
        metadata: { queueAgeMs }
      });
    }
    const failures = traces.filter(({ status }) => status !== 'answered').length;
    if (traces.length >= 5 && failures / traces.length > 0.3) {
      alerts.push({
        code: 'AI_FALLBACK_RATE',
        severity: failures / traces.length > 0.5 ? 'critical' : 'warning',
        summary: 'Fallback atau handoff AI melewati ambang operasional.',
        metadata: { total: traces.length, failures }
      });
    }
    if (
      integration?.status === 'active' &&
      (integration.activeChatConnection?.healthState !== 'ready' ||
        (!lexicalSourcesAvailable &&
          integration.activeEmbeddingConnection?.healthState !== 'ready'))
    ) {
      alerts.push({
        code: 'AI_PROVIDER_NOT_READY',
        severity: 'critical',
        summary: 'Provider aktif tidak berada pada health state ready.',
        metadata: {}
      });
    }
    for (const alert of alerts) {
      const fingerprint = hash(alert.code);
      await this.prisma.aiOperationalAlert.upsert({
        where: { tenantId_fingerprint: { tenantId, fingerprint } },
        create: {
          id: generateUuidV7(),
          tenantId,
          fingerprint,
          severity: alert.severity,
          code: alert.code,
          summary: alert.summary,
          safeMetadata: safeJson(alert.metadata),
          firstSeenAt: this.now(),
          lastSeenAt: this.now()
        },
        update: {
          severity: alert.severity,
          summary: alert.summary,
          safeMetadata: safeJson(alert.metadata),
          status: 'open',
          lastSeenAt: this.now(),
          occurrenceCount: { increment: 1 },
          acknowledgedAt: null
        }
      });
    }
  }

  public async evaluateReadiness(
    tenantId: string,
    actorUserId: string,
    input: AiReadinessEvaluate,
    requestId: string
  ): Promise<OperationsResult<unknown>> {
    await this.refreshAlerts(tenantId);
    const [integration, cases, runs, criticalAlerts, safety, lexicalSourcesAvailable] =
      await Promise.all([
        this.prisma.aiIntegration.findFirst({ where: { tenantId, name: 'default' } }),
        this.prisma.aiTestCase.findMany({
          where: { tenantId, status: 'active' },
          select: { id: true }
        }),
        this.prisma.aiTestRun.findMany({
          where: { tenantId },
          distinct: ['testCaseId'],
          orderBy: [{ testCaseId: 'asc' }, { startedAt: 'desc' }]
        }),
        this.prisma.aiOperationalAlert.count({
          where: { tenantId, status: 'open', severity: 'critical' }
        }),
        this.prisma.safetyControlState.findUnique({ where: { tenantId } }),
        this.hasLexicalSources(tenantId)
      ]);
    if (!integration) return { status: 'not_found' };
    const latest = new Map(runs.map((run) => [run.testCaseId, run]));
    const passedCases = cases.filter(({ id }) => latest.get(id)?.status === 'passed').length;
    const score = cases.length ? passedCases / cases.length : 0;
    const gates = {
      activeIntegration:
        integration.status === 'active' &&
        integration.generationEnabled &&
        (integration.retrievalEnabled || lexicalSourcesAvailable) &&
        integration.strictGrounding,
      evaluation: cases.length > 0 && score >= input.minimumScore,
      criticalAlerts: criticalAlerts === 0,
      emergencyPause: !safety?.killSwitch,
      externalEvidence: process.env.PILOT_EVIDENCE_APPROVED === 'true'
    };
    const blockers = Object.entries(gates)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    return this.prisma.$transaction(async (tx) => {
      const readiness = await tx.aiReleaseReadiness.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          integrationId: integration.id,
          status: blockers.length === 0 ? 'ready' : 'blocked',
          gateResults: safeJson(gates),
          blockers: safeJson(blockers),
          evaluatedAt: this.now()
        }
      });
      const report = await tx.aiEvaluationReport.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          readinessId: readiness.id,
          reportType: 'release',
          totalCases: cases.length,
          passedCases,
          failedCases: cases.length - passedCases,
          score: new Prisma.Decimal(score),
          metrics: safeJson({ minimumScore: input.minimumScore, gates })
        }
      });
      await tx.auditLog.create({
        data: auditData(
          tenantId,
          actorUserId,
          'ai.readiness.evaluated',
          'AiReleaseReadiness',
          readiness.id,
          input.reason,
          requestId,
          { status: readiness.status, blockers, reportId: report.id }
        )
      });
      return { status: 'ok' as const, value: { ...readiness, reports: [report] } };
    });
  }

  public async decideReadiness(
    tenantId: string,
    actorUserId: string,
    readinessId: string,
    input: AiReadinessDecision,
    requestId: string
  ): Promise<OperationsResult<unknown>> {
    const readiness = await this.prisma.aiReleaseReadiness.findFirst({
      where: { id: readinessId, tenantId }
    });
    if (!readiness) return { status: 'not_found' };
    if (readiness.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    if (input.status === 'approved' && readiness.status !== 'ready')
      return { status: 'invalid_state' };
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiReleaseReadiness.updateMany({
        where: { id: readinessId, tenantId, revision: input.expectedRevision },
        data: {
          status: input.status,
          pilotPercentage: input.status === 'paused' ? 0 : input.pilotPercentage,
          decidedByUserId: actorUserId,
          decidedAt: this.now(),
          revision: { increment: 1 }
        }
      });
      if (changed.count !== 1) return { status: 'revision_conflict' as const };
      const value = await tx.aiReleaseReadiness.findUniqueOrThrow({ where: { id: readinessId } });
      await tx.auditLog.create({
        data: auditData(
          tenantId,
          actorUserId,
          `ai.readiness.${input.status}`,
          'AiReleaseReadiness',
          readinessId,
          input.reason,
          requestId,
          { pilotPercentage: value.pilotPercentage }
        )
      });
      return { status: 'ok' as const, value };
    });
  }

  public listAlerts(tenantId: string) {
    return this.prisma.aiOperationalAlert.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: 100
    });
  }

  public async acknowledgeAlert(
    tenantId: string,
    actorUserId: string,
    alertId: string,
    reason: string,
    requestId: string
  ): Promise<OperationsResult<unknown>> {
    const alert = await this.prisma.aiOperationalAlert.findFirst({
      where: { id: alertId, tenantId }
    });
    if (!alert) return { status: 'not_found' };
    const value = await this.prisma.aiOperationalAlert.update({
      where: { id: alertId },
      data: { status: 'acknowledged', acknowledgedAt: this.now() }
    });
    await this.prisma.auditLog.create({
      data: auditData(
        tenantId,
        actorUserId,
        'ai.alert.acknowledged',
        'AiOperationalAlert',
        alertId,
        reason,
        requestId
      )
    });
    return { status: 'ok', value };
  }
}
