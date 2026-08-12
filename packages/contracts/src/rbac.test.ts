import { describe, expect, it } from 'vitest';

import { permissionSchema, resolvePermissions, rolePermissions } from './rbac.js';

describe('RBAC permission matrix', () => {
  it('contains every declared permission only once per role', () => {
    for (const permissions of Object.values(rolePermissions)) {
      expect(new Set(permissions).size).toBe(permissions.length);
      for (const permission of permissions)
        expect(permissionSchema.safeParse(permission).success).toBe(true);
    }
  });

  it('applies explicit deny after role inheritance and grants', () => {
    const permissions = resolvePermissions('viewer', {
      grant: ['session.manage', 'audit.read'],
      deny: ['overview.read', 'audit.read']
    });
    expect(permissions.has('session.manage')).toBe(true);
    expect(permissions.has('overview.read')).toBe(false);
    expect(permissions.has('audit.read')).toBe(false);
  });
});
