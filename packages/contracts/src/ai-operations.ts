import { z } from 'zod';

const reasonSchema = z.string().trim().min(8).max(500);

export const aiFeedbackRatingSchema = z.enum(['correct', 'incorrect', 'incomplete', 'unsafe']);
export const aiFeedbackCategorySchema = z.enum([
  'correct',
  'incorrect',
  'incomplete',
  'unsafe',
  'wrong_source',
  'too_long',
  'too_promotional'
]);
export const aiFeedbackSchema = z
  .object({
    rating: aiFeedbackRatingSchema,
    category: aiFeedbackCategorySchema,
    note: z.string().trim().max(1000).nullable().default(null),
    reason: reasonSchema
  })
  .strict();

export const unansweredListQuerySchema = z
  .object({
    status: z.enum(['open', 'drafted', 'resolved', 'dismissed']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const unansweredDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(240),
    answer: z.string().trim().min(1).max(32_000),
    categoryId: z.uuid().nullable().default(null),
    reason: reasonSchema
  })
  .strict();

export const aiExpectedBehaviorSchema = z
  .object({
    status: z.enum(['answered', 'fallback', 'handoff']),
    requireCitation: z.boolean().default(false),
    forbiddenTerms: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    maxLatencyMs: z.number().int().min(50).max(120_000).default(30_000)
  })
  .strict();

export const aiTestCaseCreateSchema = z
  .object({
    name: z.string().trim().min(3).max(160),
    input: z.string().trim().min(2).max(2000),
    expectedBehavior: aiExpectedBehaviorSchema,
    reason: reasonSchema
  })
  .strict();

export const aiTestCaseImportSchema = z
  .object({
    cases: z.array(aiTestCaseCreateSchema).min(1).max(100),
    reason: reasonSchema
  })
  .strict();

export const aiTestRunRequestSchema = z
  .object({
    testCaseIds: z.array(z.uuid()).min(1).max(100),
    reason: reasonSchema
  })
  .strict();

export const aiAnalyticsQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(90).default(7) })
  .strict();

export const aiReadinessEvaluateSchema = z
  .object({
    minimumScore: z.number().min(0).max(1).default(0.9),
    reason: reasonSchema
  })
  .strict();

export const aiReadinessDecisionSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    status: z.enum(['approved', 'paused']),
    pilotPercentage: z.number().int().min(0).max(100),
    reason: reasonSchema
  })
  .strict();

export const alertAcknowledgeSchema = z.object({ reason: reasonSchema }).strict();

export type AiFeedback = z.infer<typeof aiFeedbackSchema>;
export type UnansweredDraft = z.infer<typeof unansweredDraftSchema>;
export type AiExpectedBehavior = z.infer<typeof aiExpectedBehaviorSchema>;
export type AiTestCaseCreate = z.infer<typeof aiTestCaseCreateSchema>;
export type AiTestRunRequest = z.infer<typeof aiTestRunRequestSchema>;
export type AiReadinessEvaluate = z.infer<typeof aiReadinessEvaluateSchema>;
export type AiReadinessDecision = z.infer<typeof aiReadinessDecisionSchema>;
