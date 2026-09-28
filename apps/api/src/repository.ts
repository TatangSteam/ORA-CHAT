import { type PermissionOverrides, permissionOverridesSchema, roleSchema } from '@raho/contracts';
import { generateUuidV7, type Prisma, type PrismaClient } from '@raho/db';

export interface LoginIdentity {
  userId: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordChangedAt: Date;
  userStatus: string;
  membershipId: string;
  role: ReturnType<typeof roleSchema.parse>;
  permissionOverrides: PermissionOverrides;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: string;
}

export interface SessionIdentity extends LoginIdentity {
  sessionId: string;
  sessionCreatedAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  csrfSecretHash: string;
}

export interface NewSession {
  sessionId: string;
  identity: LoginIdentity;
  tokenHash: string;
  csrfSecretHash: string;
  ipHash: string;
  userAgentHash: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  requestId: string;
}

export interface AuditInput {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditPage {
  items: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    reason: string | null;
    requestId: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  nextCursor: string | null;
}

export interface SafetyState {
  sendingPaused: boolean;
  killSwitch: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string | null;
  revision: number;
  updatedAt: Date;
}

export interface WhatsAppState {
  adapter: string;
  state:
    | 'starting'
    | 'connecting'
    | 'qr_required'
    | 'connected'
    | 'reconnecting'
    | 'paused'
    | 'logged_out'
    | 'bad_session'
    | 'disconnected'
    | 'shutting_down';
  connectedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastErrorCode: string | null;
  revision: number;
  updatedAt: Date;
}

export interface ApiRepository {
  ping(): Promise<void>;
  findLoginIdentity(tenantSlug: string, username: string): Promise<LoginIdentity | null>;
  recordLoginFailure(identity: LoginIdentity, requestId: string): Promise<void>;
  createSession(input: NewSession): Promise<{ sessionId: string }>;
  findSession(tokenHash: string): Promise<SessionIdentity | null>;
  touchSession(sessionId: string, idleExpiresAt: Date, now: Date): Promise<void>;
  revokeSession(sessionId: string, requestId: string, reason: string): Promise<void>;
  changePassword(
    session: SessionIdentity,
    passwordHash: string,
    requestId: string,
    now: Date
  ): Promise<void>;
  appendAudit(input: AuditInput): Promise<void>;
  listAudit(tenantId: string, cursor: string | undefined, limit: number): Promise<AuditPage>;
  getSafetyState(tenantId: string): Promise<SafetyState>;
  updateSafetyState(input: {
    tenantId: string;
    actorUserId: string;
    expectedRevision: number;
    sendingPaused: boolean;
    killSwitch?: boolean;
    reason: string;
    requestId: string;
    action: string;
  }): Promise<SafetyState | null>;
  getWhatsAppState(tenantId: string): Promise<WhatsAppState>;
  updateWhatsAppState(input: {
    tenantId: string;
    actorUserId: string;
    expectedRevision: number;
    state: WhatsAppState['state'];
    reason?: string;
    requestId: string;
    action: string;
  }): Promise<WhatsAppState | null>;
}

const toIdentity = (membership: {
  id: string;
  role: string;
  permissionOverrides: unknown;
  tenant: { id: string; slug: string; name: string; status: string };
  adminUser: {
    id: string;
    username: string;
    displayName: string;
    passwordHash: string;
    passwordChangedAt: Date;
    status: string;
  };
}): LoginIdentity => ({
  userId: membership.adminUser.id,
  username: membership.adminUser.username,
  displayName: membership.adminUser.displayName,
  passwordHash: membership.adminUser.passwordHash,
  passwordChangedAt: membership.adminUser.passwordChangedAt,
  userStatus: membership.adminUser.status,
  membershipId: membership.id,
  role: roleSchema.parse(membership.role),
  permissionOverrides: permissionOverridesSchema.parse(membership.permissionOverrides),
  tenantId: membership.tenant.id,
  tenantSlug: membership.tenant.slug,
  tenantName: membership.tenant.name,
  tenantStatus: membership.tenant.status
});

const auditData = (input: AuditInput) => ({
  id: generateUuidV7(),
  tenantId: input.tenantId,
  actorUserId: input.actorUserId,
  action: input.action,
  entityType: input.entityType,
  entityId: input.entityId ?? null,
  reason: input.reason ?? null,
  requestId: input.requestId,
  metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
});

export class PrismaApiRepository implements ApiRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  public async findLoginIdentity(
    tenantSlug: string,
    username: string
  ): Promise<LoginIdentity | null> {
    const membership = await this.prisma.adminTenantMembership.findFirst({
      where: { tenant: { slug: tenantSlug }, adminUser: { username } },
      include: { tenant: true, adminUser: true }
    });
    return membership ? toIdentity(membership) : null;
  }

  public async recordLoginFailure(identity: LoginIdentity, requestId: string): Promise<void> {
    await this.appendAudit({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      action: 'auth.login.failed',
      entityType: 'AdminUser',
      entityId: identity.userId,
      requestId,
      metadata: { outcome: 'invalid_credentials' }
    });
  }

  public async createSession(input: NewSession): Promise<{ sessionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.adminSession.create({
        data: {
          id: input.sessionId,
          membershipId: input.identity.membershipId,
          adminUserId: input.identity.userId,
          tenantId: input.identity.tenantId,
          tokenHash: input.tokenHash,
          csrfSecretHash: input.csrfSecretHash,
          ipHash: input.ipHash,
          userAgentHash: input.userAgentHash,
          expiresAt: input.expiresAt,
          idleExpiresAt: input.idleExpiresAt
        }
      });
      const olderSessions = await tx.adminSession.findMany({
        where: { adminUserId: input.identity.userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        select: { id: true }
      });
      if (olderSessions.length > 0) {
        await tx.adminSession.updateMany({
          where: { id: { in: olderSessions.map(({ id }) => id) } },
          data: { revokedAt: new Date(), revokedReason: 'concurrent_session_limit' }
        });
      }
      await tx.adminUser.update({
        where: { id: input.identity.userId },
        data: { lastLoginAt: new Date() }
      });
      await tx.auditLog.create({
        data: auditData({
          tenantId: input.identity.tenantId,
          actorUserId: input.identity.userId,
          action: 'auth.login.succeeded',
          entityType: 'AdminSession',
          entityId: session.id,
          requestId: input.requestId,
          metadata: { outcome: 'success' }
        })
      });
      return { sessionId: session.id };
    });
  }

  public async findSession(tokenHash: string): Promise<SessionIdentity | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { membership: { include: { tenant: true, adminUser: true } } }
    });
    if (!session) return null;
    return {
      ...toIdentity(session.membership),
      sessionId: session.id,
      sessionCreatedAt: session.createdAt,
      expiresAt: session.expiresAt,
      idleExpiresAt: session.idleExpiresAt,
      revokedAt: session.revokedAt,
      csrfSecretHash: session.csrfSecretHash
    };
  }

  public async touchSession(sessionId: string, idleExpiresAt: Date, now: Date): Promise<void> {
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: now, idleExpiresAt }
    });
  }

  public async revokeSession(sessionId: string, requestId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.adminSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: reason }
      });
      await tx.auditLog.create({
        data: auditData({
          tenantId: session.tenantId,
          actorUserId: session.adminUserId,
          action: 'auth.session.revoked',
          entityType: 'AdminSession',
          entityId: session.id,
          reason,
          requestId
        })
      });
    });
  }

  public async changePassword(
    session: SessionIdentity,
    passwordHash: string,
    requestId: string,
    now: Date
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: session.userId },
        data: { passwordHash, passwordChangedAt: now }
      });
      await tx.adminSession.updateMany({
        where: { adminUserId: session.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'password_changed' }
      });
      await tx.auditLog.create({
        data: auditData({
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: 'auth.password.changed',
          entityType: 'AdminUser',
          entityId: session.userId,
          reason: 'Password changed by account owner',
          requestId
        })
      });
    });
  }

  public async appendAudit(input: AuditInput): Promise<void> {
    await this.prisma.auditLog.create({ data: auditData(input) });
  }

  public async listAudit(
    tenantId: string,
    cursor: string | undefined,
    limit: number
  ): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  public async getSafetyState(tenantId: string): Promise<SafetyState> {
    const state = await this.prisma.safetyControlState.findUniqueOrThrow({ where: { tenantId } });
    return { ...state, riskLevel: state.riskLevel as SafetyState['riskLevel'] };
  }

  public async updateSafetyState(input: {
    tenantId: string;
    actorUserId: string;
    expectedRevision: number;
    sendingPaused: boolean;
    killSwitch?: boolean;
    reason: string;
    requestId: string;
    action: string;
  }): Promise<SafetyState | null> {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.safetyControlState.updateMany({
        where: { tenantId: input.tenantId, revision: input.expectedRevision },
        data: {
          sendingPaused: input.sendingPaused,
          ...(input.killSwitch === undefined ? {} : { killSwitch: input.killSwitch }),
          reason: input.reason,
          changedBy: input.actorUserId,
          revision: { increment: 1 }
        }
      });
      if (update.count !== 1) return null;
      const state = await tx.safetyControlState.findUniqueOrThrow({
        where: { tenantId: input.tenantId }
      });
      await tx.auditLog.create({
        data: auditData({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: 'SafetyControlState',
          entityId: input.tenantId,
          reason: input.reason,
          requestId: input.requestId,
          metadata: { revision: state.revision }
        })
      });
      return { ...state, riskLevel: state.riskLevel as SafetyState['riskLevel'] };
    });
  }

  public async getWhatsAppState(tenantId: string): Promise<WhatsAppState> {
    const state = await this.prisma.whatsAppSessionState.findUniqueOrThrow({
      where: { tenantId }
    });
    return { ...state, state: state.state as WhatsAppState['state'] };
  }

  public async updateWhatsAppState(input: {
    tenantId: string;
    actorUserId: string;
    expectedRevision: number;
    state: WhatsAppState['state'];
    reason?: string;
    requestId: string;
    action: string;
  }): Promise<WhatsAppState | null> {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.whatsAppSessionState.updateMany({
        where: { tenantId: input.tenantId, revision: input.expectedRevision },
        data: {
          state: input.state,
          lastErrorCode: null,
          revision: { increment: 1 }
        }
      });
      if (update.count !== 1) return null;
      const state = await tx.whatsAppSessionState.findUniqueOrThrow({
        where: { tenantId: input.tenantId }
      });
      await tx.auditLog.create({
        data: auditData({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: 'WhatsAppSessionState',
          entityId: input.tenantId,
          ...(input.reason ? { reason: input.reason } : {}),
          requestId: input.requestId,
          metadata: { revision: state.revision, targetState: input.state }
        })
      });
      return { ...state, state: state.state as WhatsAppState['state'] };
    });
  }
}
