import { readFileSync } from 'node:fs';

import { createDatabaseClient } from './prisma.js';
import { hashPassword } from './password.js';
import { generateUuidV7 } from './uuid-v7.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeUsername = (value: string): string => {
  const normalized = value.normalize('NFKC').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(normalized)) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME must be 3-64 lowercase-safe characters');
  }
  return normalized;
};

const passwordFile = required('BOOTSTRAP_ADMIN_PASSWORD_FILE');
const password = readFileSync(passwordFile, 'utf8').trimEnd();
const passwordHash = await hashPassword(password);
const username = normalizeUsername(process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'superadmin');
const tenantSlug = (process.env.BOOTSTRAP_TENANT_SLUG ?? 'default').toLowerCase();
const tenantName = process.env.BOOTSTRAP_TENANT_NAME ?? 'RAHO';
const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? 'Super Admin';
const prisma = createDatabaseClient();

try {
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: tenantSlug },
      update: { name: tenantName },
      create: { id: generateUuidV7(), slug: tenantSlug, name: tenantName }
    });
    const existingUser = await tx.adminUser.findUnique({ where: { username } });
    const user =
      existingUser ??
      (await tx.adminUser.create({
        data: { id: generateUuidV7(), username, displayName, passwordHash }
      }));
    const membership = await tx.adminTenantMembership.upsert({
      where: { adminUserId_tenantId: { adminUserId: user.id, tenantId: tenant.id } },
      update: { role: 'super_admin' },
      create: {
        id: generateUuidV7(),
        adminUserId: user.id,
        tenantId: tenant.id,
        role: 'super_admin',
        permissionOverrides: { grant: [], deny: [] }
      }
    });
    await tx.whatsAppSessionState.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { tenantId: tenant.id }
    });
    await tx.safetyControlState.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { tenantId: tenant.id }
    });
    await tx.auditLog.create({
      data: {
        id: generateUuidV7(),
        tenantId: tenant.id,
        actorUserId: user.id,
        action: existingUser ? 'identity.bootstrap.reconciled' : 'identity.bootstrap.created',
        entityType: 'AdminTenantMembership',
        entityId: membership.id,
        reason: 'Local identity bootstrap',
        requestId: `bootstrap-${generateUuidV7()}`,
        metadata: { actorType: 'admin_user', source: 'local_bootstrap' }
      }
    });
    return { created: !existingUser, tenantId: tenant.id, userId: user.id };
  });

  process.stdout.write(
    `${JSON.stringify({ status: 'ok', created: result.created, tenantId: result.tenantId, userId: result.userId })}\n`
  );
} finally {
  await prisma.$disconnect();
}
