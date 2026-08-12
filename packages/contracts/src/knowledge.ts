import { z } from 'zod';

const reasonSchema = z.string().trim().min(8).max(500);

export const knowledgeLifecycleSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'published',
  'archived'
]);
export const documentPipelineStateSchema = z.enum([
  'uploaded',
  'queued',
  'extracting',
  'cleaning',
  'chunking',
  'embedding',
  'ready',
  'failed',
  'archived'
]);
export const knowledgeMimeSchema = z.enum([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

export const knowledgeCategoryCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    parentId: z.uuid().nullable().default(null),
    reason: reasonSchema
  })
  .strict();

export const knowledgeItemCreateSchema = z
  .object({
    categoryId: z.uuid().nullable().default(null),
    title: z.string().trim().min(3).max(240),
    answer: z.string().trim().min(1).max(32_000),
    questionVariants: z.array(z.string().trim().min(2).max(500)).max(40).default([]),
    reason: reasonSchema
  })
  .strict();

export const knowledgeItemUpdateSchema = knowledgeItemCreateSchema
  .omit({ reason: true })
  .extend({ expectedRevision: z.number().int().min(0), reason: reasonSchema })
  .strict();

export const knowledgeLifecycleTransitionSchema = z
  .object({
    target: knowledgeLifecycleSchema.exclude(['draft']),
    expectedRevision: z.number().int().min(0),
    reason: reasonSchema
  })
  .strict();

export const documentMutationSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    reason: reasonSchema
  })
  .strict();

export const knowledgeListQuerySchema = z
  .object({
    status: knowledgeLifecycleSchema.optional(),
    query: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const documentListQuerySchema = z
  .object({
    state: documentPipelineStateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const knowledgeSearchTestSchema = z
  .object({
    query: z.string().trim().min(2).max(2_000),
    limit: z.number().int().min(1).max(20).default(5)
  })
  .strict();

export const ragPlaygroundSchema = z
  .object({
    question: z.string().trim().min(2).max(2_000)
  })
  .strict();

export const aiPromptVersionCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    template: z.string().trim().min(20).max(32_000),
    expectedRevision: z.number().int().min(0).optional(),
    reason: reasonSchema
  })
  .strict();

export type KnowledgeCategoryCreate = z.infer<typeof knowledgeCategoryCreateSchema>;
export type KnowledgeItemCreate = z.infer<typeof knowledgeItemCreateSchema>;
export type KnowledgeItemUpdate = z.infer<typeof knowledgeItemUpdateSchema>;
export type KnowledgeLifecycleTransition = z.infer<typeof knowledgeLifecycleTransitionSchema>;
export type DocumentMutation = z.infer<typeof documentMutationSchema>;
export type KnowledgeSearchTest = z.infer<typeof knowledgeSearchTestSchema>;
export type RagPlayground = z.infer<typeof ragPlaygroundSchema>;
export type AiPromptVersionCreate = z.infer<typeof aiPromptVersionCreateSchema>;
