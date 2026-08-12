import { z } from 'zod';

export const roleSchema = z.enum(['viewer', 'operator', 'admin', 'super_admin']);

export const permissionSchema = z.enum([
  'overview.read',
  'messages.read',
  'messages.send',
  'messages.retry',
  'contacts.read',
  'handoffs.read',
  'handoffs.manage',
  'chatbot.read',
  'chatbot.manage',
  'knowledge.read',
  'knowledge.manage',
  'knowledge.publish',
  'ai.settings.manage',
  'ai.activate',
  'ai.analytics.read',
  'templates.read',
  'templates.manage',
  'session.read',
  'session.manage',
  'safety.read',
  'safety.manage',
  'safety.reset',
  'audit.read'
]);

export const permissionOverridesSchema = z
  .object({
    grant: z.array(permissionSchema).max(permissionSchema.options.length),
    deny: z.array(permissionSchema).max(permissionSchema.options.length)
  })
  .strict();

export type Role = z.infer<typeof roleSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type PermissionOverrides = z.infer<typeof permissionOverridesSchema>;

const viewerPermissions: Permission[] = [
  'overview.read',
  'messages.read',
  'contacts.read',
  'handoffs.read',
  'chatbot.read',
  'knowledge.read',
  'ai.analytics.read',
  'templates.read',
  'session.read',
  'safety.read'
];

export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  viewer: viewerPermissions,
  operator: [
    ...viewerPermissions,
    'messages.send',
    'messages.retry',
    'handoffs.manage',
    'templates.manage'
  ],
  admin: [
    ...viewerPermissions,
    'messages.send',
    'messages.retry',
    'handoffs.manage',
    'templates.manage',
    'chatbot.manage',
    'knowledge.manage',
    'knowledge.publish',
    'ai.settings.manage',
    'ai.activate',
    'session.manage',
    'safety.manage'
  ],
  super_admin: permissionSchema.options
};

export const resolvePermissions = (
  role: Role,
  untrustedOverrides: unknown
): ReadonlySet<Permission> => {
  const overrides = permissionOverridesSchema.parse(untrustedOverrides);
  const resolved = new Set<Permission>([...rolePermissions[role], ...overrides.grant]);
  for (const denied of overrides.deny) resolved.delete(denied);
  return resolved;
};
