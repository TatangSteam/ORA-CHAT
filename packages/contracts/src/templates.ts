import { z } from 'zod';

export const templateVariableNameSchema = z.enum([
  'nama_pelanggan',
  'nomor_pelanggan',
  'nama_admin',
  'tanggal',
  'informasi_tambahan'
]);

export const templateStatusSchema = z.enum(['active', 'inactive', 'archived']);
export const templateVersionStatusSchema = z.enum(['draft', 'published', 'retired']);

export const templateChecklistInputSchema = z
  .object({
    sequence: z.number().int().min(0).max(100),
    label: z.string().trim().min(1).max(240),
    required: z.boolean().default(true)
  })
  .strict();

export const templateVersionInputSchema = z
  .object({
    body: z.string().trim().min(1).max(4096),
    variableSchema: z
      .array(templateVariableNameSchema)
      .max(templateVariableNameSchema.options.length),
    checklist: z.array(templateChecklistInputSchema).max(25).default([])
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.variableSchema).size !== value.variableSchema.length) {
      context.addIssue({ code: 'custom', message: 'Variable template harus unik.' });
    }
    if (new Set(value.checklist.map(({ sequence }) => sequence)).size !== value.checklist.length) {
      context.addIssue({ code: 'custom', message: 'Urutan checklist harus unik.' });
    }
    const placeholders = [...value.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gu)].map(
      (match) => match[1]
    );
    const allowed = new Set(value.variableSchema);
    if (
      placeholders.some((placeholder) => !templateVariableNameSchema.safeParse(placeholder).success)
    ) {
      context.addIssue({ code: 'custom', message: 'Body memuat variable yang tidak didukung.' });
    }
    if (placeholders.some((placeholder) => !allowed.has(placeholder as never))) {
      context.addIssue({ code: 'custom', message: 'Body memuat variable di luar schema.' });
    }
    if (value.variableSchema.some((variable) => !placeholders.includes(variable))) {
      context.addIssue({ code: 'custom', message: 'Schema memuat variable yang tidak dipakai.' });
    }
  });

export const templateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(64),
    version: templateVersionInputSchema
  })
  .strict();

export const templateListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: templateStatusSchema.optional(),
    search: z.string().trim().max(160).optional()
  })
  .strict();

export const templateVersionCreateSchema = z
  .object({ expectedVersion: z.number().int().min(1), version: templateVersionInputSchema })
  .strict();

export const templatePublishSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();

export const templateDuplicateSchema = z
  .object({ name: z.string().trim().min(1).max(160) })
  .strict();

export const templateLifecycleSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    status: templateStatusSchema,
    reason: z.string().trim().min(8).max(500)
  })
  .strict();

export const templateResolvedVariablesSchema = z.partialRecord(
  templateVariableNameSchema,
  z.string().trim().max(1000)
);

export const templatePreviewSchema = z
  .object({
    templateVersionId: z.uuid(),
    variables: templateResolvedVariablesSchema
  })
  .strict();

export const messageTemplateSelectionSchema = z
  .object({
    templateVersionId: z.uuid(),
    variables: templateResolvedVariablesSchema,
    checklist: z.array(z.object({ itemId: z.uuid(), checked: z.boolean() }).strict()).max(25)
  })
  .strict();

export type TemplateVariableName = z.infer<typeof templateVariableNameSchema>;
export type TemplateVersionInput = z.infer<typeof templateVersionInputSchema>;
export type MessageTemplateSelection = z.infer<typeof messageTemplateSelectionSchema>;
