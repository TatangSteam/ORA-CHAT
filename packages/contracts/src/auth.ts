import { z } from 'zod';

import { permissionSchema, roleSchema } from './rbac.js';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .transform((value) => value.normalize('NFKC').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/u));

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u);

export const loginRequestSchema = z
  .object({
    tenantSlug: tenantSlugSchema,
    username: usernameSchema,
    password: z.string().min(1).max(512)
  })
  .strict();

export const passwordChangeRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(512),
    newPassword: z.string().min(12).max(128)
  })
  .strict();

export const currentUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  membership: z.object({ id: z.uuid(), role: roleSchema }),
  permissions: z.array(permissionSchema),
  csrfToken: z.string().min(32)
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
