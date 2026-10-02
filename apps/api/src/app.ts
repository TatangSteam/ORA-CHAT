import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import qrCode from 'qrcode';
import {
  aiAnalyticsQuerySchema,
  aiConnectionTestSchema,
  aiFeedbackSchema,
  aiReadinessDecisionSchema,
  aiReadinessEvaluateSchema,
  aiTestCaseCreateSchema,
  aiTestCaseImportSchema,
  aiTestRunRequestSchema,
  alertAcknowledgeSchema,
  aiCredentialDeleteSchema,
  aiCredentialReplaceSchema,
  aiIntegrationActivationSchema,
  aiIntegrationDeactivateSchema,
  aiProviderConnectionCreateSchema,
  aiProviderConnectionUpdateSchema,
  chatbotConfigRequestSchema,
  chatbotPublishRequestSchema,
  chatbotTestRequestSchema,
  contactCreateRequestSchema,
  contactListQuerySchema,
  conversationListQuerySchema,
  createMessageRequestSchema,
  currentUserSchema,
  cursorPaginationQuerySchema,
  handoffAssignRequestSchema,
  handoffCreateRequestSchema,
  handoffListQuerySchema,
  handoffNotificationUpdateRequestSchema,
  handoffResolveRequestSchema,
  healthResponseSchema,
  inboundProviderEventSchema,
  aiPromptVersionCreateSchema,
  documentListQuerySchema,
  documentMutationSchema,
  knowledgeCategoryCreateSchema,
  knowledgeItemCreateSchema,
  knowledgeItemUpdateSchema,
  knowledgeLifecycleTransitionSchema,
  knowledgeListQuerySchema,
  knowledgeMimeSchema,
  knowledgeSearchTestSchema,
  loginRequestSchema,
  messageListQuerySchema,
  normalizeIndonesianPhone,
  outboxListQuerySchema,
  outboxMutationRequestSchema,
  outboxReconcileRequestSchema,
  passwordChangeRequestSchema,
  revisionedReasonRequestSchema,
  ragPlaygroundSchema,
  resolvePermissions,
  safetyResetRequestSchema,
  sessionDisconnectRequestSchema,
  sessionReconnectRequestSchema,
  sessionResetRequestSchema,
  templateCreateSchema,
  templateDuplicateSchema,
  templateLifecycleSchema,
  templateListQuerySchema,
  templatePreviewSchema,
  templatePublishSchema,
  templateVersionCreateSchema,
  type Permission,
  type RequestMeta,
  unansweredDraftSchema,
  unansweredListQuerySchema
} from '@raho/contracts';
import {
  createDatabaseClient,
  generateUuidV7,
  hashPassword,
  readAiMasterKey,
  verifyPassword
} from '@raho/db';
import {
  privateObjectKey,
  putPrivateObject,
  type createStorageClient,
  type StorageConfig
} from '@raho/storage';
import { PrismaAiRepository, type AiMutationResult, type AiRepository } from './ai-repository.js';
import { PinnedSafeHttpTransport } from './ai-provider.js';
import { LoginRateLimiter } from './rate-limit.js';
import { serializeSseEvent, TenantEventHub } from './event-hub.js';
import { shouldRunAiAutomation } from './inbound-routing.js';
import { dependencyStatuses, type StorageProbe } from './operations.js';
import { PrismaMessagingRepository } from './messaging-repository.js';
import {
  CUSTOMER_ADMIN_HANDOFF_RESPONSE,
  PrismaKnowledgeRepository
} from './knowledge-repository.js';
import { PrismaAiOperationsRepository } from './ai-operations-repository.js';
import { PrismaTemplateRepository } from './template-repository.js';
import { type ApiRepository, PrismaApiRepository, type SessionIdentity } from './repository.js';
import { permissionForRoute, type HttpMethod } from './route-policy.js';
import {
  cookieName,
  hashOpaqueValue,
  issueLoginCsrf,
  keyedHash,
  LOGIN_CSRF_COOKIE,
  newOpaqueToken,
  parseCookies,
  readApplicationHashKey,
  sessionCsrfToken,
  serializeCookie,
  SESSION_ABSOLUTE_MS,
  SESSION_ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_IDLE_MS,
  verifyLoginCsrf
} from './security.js';
import {
  readInternalToken,
  type QrProvider,
  type WhatsAppSessionController,
  verifyInternalToken as verifyWhatsAppInternalToken
} from './whatsapp.js';

export interface OutboxEnqueuer {
  enqueue(tenantId: string, outboxMessageId: string, availableAt?: Date): Promise<void>;
}

export interface KnowledgeEnqueuer {
  document(tenantId: string, documentId: string): Promise<void>;
  reindex(tenantId: string): Promise<void>;
}

interface AppOptions {
  repository?: ApiRepository;
  messagingRepository?: PrismaMessagingRepository;
  aiRepository?: AiRepository;
  knowledgeRepository?: PrismaKnowledgeRepository;
  aiOperationsRepository?: PrismaAiOperationsRepository;
  templateRepository?: PrismaTemplateRepository;
  knowledgeEnqueuer?: KnowledgeEnqueuer;
  knowledgeStorage?: {
    client: ReturnType<typeof createStorageClient>;
    config: StorageConfig;
  };
  outboxEnqueuer?: OutboxEnqueuer;
  internalToken?: string;
  hashKey?: Buffer;
  production?: boolean;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  storageProbe?: StorageProbe;
  qrProvider?: QrProvider;
  whatsappSessionController?: WhatsAppSessionController;
  csNotificationPhone?: string;
  eventHub?: TenantEventHub;
}

interface RequestContext {
  meta: RequestMeta;
  session?: SessionIdentity;
  permissions?: ReadonlySet<Permission>;
}

const contexts = new WeakMap<Request, RequestContext>();
const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let dummyPasswordHash: Promise<string> | undefined;
const getDummyPasswordHash = () => {
  dummyPasswordHash ??= hashPassword(newOpaqueToken());
  return dummyPasswordHash;
};

const requestContext = (request: Request): RequestContext => {
  const context = contexts.get(request);
  if (!context) throw new Error('Request context is unavailable');
  return context;
};

const routeId = (request: Request): string => {
  const value = request.params.id;
  return Array.isArray(value) ? value[0]! : value!;
};

export const createApp = (options: AppOptions = {}): Express => {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? wait;
  const hashKey = options.hashKey ?? readApplicationHashKey();
  const repository = options.repository ?? new PrismaApiRepository(createDatabaseClient());
  const messagingRepository =
    options.messagingRepository ??
    (options.repository ? undefined : new PrismaMessagingRepository(createDatabaseClient()));
  const aiRepository =
    options.aiRepository ??
    (options.repository
      ? undefined
      : new PrismaAiRepository(
          createDatabaseClient(),
          readAiMasterKey(),
          new PinnedSafeHttpTransport({
            privateHostAllowlist: (process.env.AI_PRIVATE_HOST_ALLOWLIST ?? '')
              .split(',')
              .filter(Boolean),
            allowedPrivatePorts: (process.env.AI_PRIVATE_PORT_ALLOWLIST ?? '')
              .split(',')
              .map(Number)
              .filter(Number.isInteger)
          })
        ));
  const knowledgeRepository =
    options.knowledgeRepository ??
    (options.repository
      ? undefined
      : new PrismaKnowledgeRepository(
          createDatabaseClient(),
          readAiMasterKey(),
          new PinnedSafeHttpTransport({
            privateHostAllowlist: (process.env.AI_PRIVATE_HOST_ALLOWLIST ?? '')
              .split(',')
              .filter(Boolean),
            allowedPrivatePorts: (process.env.AI_PRIVATE_PORT_ALLOWLIST ?? '')
              .split(',')
              .map(Number)
              .filter(Number.isInteger)
          })
        ));
  const aiOperationsRepository =
    options.aiOperationsRepository ??
    (options.repository
      ? undefined
      : new PrismaAiOperationsRepository(createDatabaseClient(), now));
  const templateRepository =
    options.templateRepository ??
    (options.repository ? undefined : new PrismaTemplateRepository(createDatabaseClient()));
  const internalToken =
    options.internalToken ??
    (process.env.WHATSAPP_INTERNAL_TOKEN_FILE ? readInternalToken() : undefined);
  const limiter = new LoginRateLimiter(hashKey, () => now().getTime());
  const eventHub = options.eventHub ?? new TenantEventHub();
  const sessionCookieName = cookieName(production);
  const app = express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_request, response, next) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(express.json({ limit: '1mb', type: 'application/json' }));
  app.use((request, response, next) => {
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && /^[a-zA-Z0-9._:-]{1,80}$/u.test(incoming) ? incoming : generateUuidV7();
    const traceparent = request.header('traceparent');
    const traceId =
      /^00-([a-f0-9]{32})-[a-f0-9]{16}-[01][a-f0-9]$/u.exec(traceparent ?? '')?.[1] ??
      createHash('sha256').update(requestId).digest('hex').slice(0, 32);
    const meta = { requestId, traceId, timestamp: now().toISOString() };
    contexts.set(request, { meta });
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Trace-Id', traceId);
    next();
  });

  const success = (request: Request, response: Response, data: unknown, status = 200) =>
    response.status(status).json({ data, meta: requestContext(request).meta });
  const failure = (
    request: Request,
    response: Response,
    status: number,
    code: string,
    message: string
  ) =>
    response.status(status).json({ error: { code, message }, meta: requestContext(request).meta });

  const refreshSessionActivity = async (session: SessionIdentity, current: Date): Promise<void> => {
    const idleExpiresAt = new Date(
      Math.min(session.expiresAt.getTime(), current.getTime() + SESSION_IDLE_MS)
    );
    if (
      idleExpiresAt.getTime() - session.idleExpiresAt.getTime() <
      SESSION_ACTIVITY_WRITE_INTERVAL_MS
    ) {
      return;
    }
    await repository.touchSession(session.sessionId, idleExpiresAt, current);
    session.idleExpiresAt = idleExpiresAt;
  };

  const authenticate = async (request: Request, response: Response, next: NextFunction) => {
    const token = parseCookies(request.header('cookie')).get(sessionCookieName);
    if (!token)
      return failure(request, response, 401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
    const session = await repository.findSession(hashOpaqueValue(token));
    const current = now();
    const invalid =
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= current ||
      session.idleExpiresAt <= current ||
      session.passwordChangedAt > session.sessionCreatedAt ||
      session.userStatus !== 'active' ||
      session.tenantStatus !== 'active';
    if (!session || invalid) {
      response.setHeader(
        'Set-Cookie',
        serializeCookie(sessionCookieName, '', { production, maxAgeSeconds: 0 })
      );
      return failure(request, response, 401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
    }
    const context = requestContext(request);
    context.session = session;
    context.permissions = resolvePermissions(session.role, session.permissionOverrides);
    if (request.header('x-session-activity') === '1') {
      await refreshSessionActivity(session, current);
    }
    return next();
  };

  const requirePermission =
    (permission: Permission) => (request: Request, response: Response, next: NextFunction) => {
      if (!requestContext(request).permissions?.has(permission)) {
        return failure(
          request,
          response,
          403,
          'FORBIDDEN',
          'Anda tidak memiliki izin untuk aksi ini.'
        );
      }
      return next();
    };
  const requireRoutePermission = (method: HttpMethod, path: string) =>
    requirePermission(permissionForRoute(method, path));

  const requireCsrf = (request: Request, response: Response, next: NextFunction) => {
    const session = requestContext(request).session;
    const token = request.header('x-csrf-token');
    if (!session || !token || hashOpaqueValue(token) !== session.csrfSecretHash) {
      return failure(request, response, 403, 'CSRF_INVALID', 'Token CSRF tidak valid.');
    }
    return next();
  };

  const templateFailure = (request: Request, response: Response, error: unknown) => {
    const code = error instanceof Error ? error.message : '';
    if (code === 'TEMPLATE_NOT_FOUND' || code === 'TEMPLATE_VERSION_NOT_FOUND') {
      return failure(request, response, 404, 'NOT_FOUND', 'Template tidak ditemukan.');
    }
    if (code === 'REVISION_CONFLICT') {
      return failure(
        request,
        response,
        409,
        'REVISION_CONFLICT',
        'Template telah berubah. Muat ulang data.'
      );
    }
    if (
      code === 'TEMPLATE_ARCHIVED' ||
      code === 'TEMPLATE_NOT_PUBLISHED' ||
      code === 'TEMPLATE_VERSION_NOT_DRAFT' ||
      code === 'TEMPLATE_VERSION_NOT_ACTIVE'
    ) {
      return failure(
        request,
        response,
        409,
        code,
        'Lifecycle template tidak mengizinkan aksi ini.'
      );
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return failure(
        request,
        response,
        409,
        'TEMPLATE_NAME_CONFLICT',
        'Nama template sudah dipakai.'
      );
    }
    return failure(request, response, 400, 'INVALID_TEMPLATE', 'Template tidak valid.');
  };

  const overview = async (tenantId: string) => {
    const [baseDependencies, safety, metrics, aiIntegration] = await Promise.all([
      dependencyStatuses(repository, options.storageProbe),
      repository.getSafetyState(tenantId),
      messagingRepository?.metrics(tenantId),
      aiRepository?.getIntegration(tenantId).catch(() => null)
    ]);
    const dependencies = baseDependencies.map((dependency) => {
      if (dependency.name === 'chat_provider') {
        return {
          ...dependency,
          status:
            aiIntegration?.generationEnabled && aiIntegration.activeChatConnectionId
              ? ('healthy' as const)
              : ('not_configured' as const)
        };
      }
      if (dependency.name === 'embedding_provider') {
        return {
          ...dependency,
          status:
            aiIntegration?.retrievalEnabled && aiIntegration.activeEmbeddingConnectionId
              ? ('healthy' as const)
              : ('not_configured' as const)
        };
      }
      return dependency;
    });
    return {
      dependencies,
      sendingPaused: safety.sendingPaused,
      killSwitch: safety.killSwitch,
      riskLevel: safety.riskLevel,
      metricsAvailable: Boolean(metrics),
      metrics: metrics ?? { inbound: 0, outbound: 0, failed: 0, pending: 0, handoffs: 0 },
      lastUpdatedAt: now().toISOString(),
      degraded: dependencies.some(({ status }) => status === 'degraded' || status === 'unavailable')
    };
  };
  const publishOverview = async (tenantId: string) =>
    eventHub.publish(tenantId, 'overview', await overview(tenantId));

  const aiFailure = <T>(
    request: Request,
    response: Response,
    result: Exclude<AiMutationResult<T>, { status: 'ok' }>
  ) => {
    if (result.status === 'not_found')
      return failure(request, response, 404, 'NOT_FOUND', 'Koneksi AI tidak ditemukan.');
    if (result.status === 'revision_conflict')
      return failure(
        request,
        response,
        409,
        'REVISION_CONFLICT',
        'Konfigurasi telah berubah. Muat ulang data.'
      );
    if (result.status === 'reindex_required')
      return failure(
        request,
        response,
        409,
        'REINDEX_REQUIRED',
        'Model atau dimensi embedding berubah dan memerlukan reindex.'
      );
    return failure(
      request,
      response,
      409,
      'CONNECTION_NOT_READY',
      'Koneksi harus diuji dan berstatus siap.'
    );
  };

  app.get('/health/live', (_request, response) => {
    response.json(healthResponseSchema.parse({ service: 'api', status: 'live' }));
  });

  app.get('/health/ready', async (request, response) => {
    const dependencies = await dependencyStatuses(repository, options.storageProbe);
    const critical = dependencies.filter(({ name }) =>
      ['database', 'redis', 'minio'].includes(name)
    );
    if (critical.some(({ status }) => status !== 'healthy')) {
      return failure(request, response, 503, 'NOT_READY', 'API belum siap menerima traffic.');
    }
    return success(request, response, {
      service: 'api',
      status: 'ready',
      checkedAt: now().toISOString()
    });
  });

  app.get('/api/admin/v1/auth/csrf', (request, response) => {
    const csrf = issueLoginCsrf(hashKey);
    response.setHeader(
      'Set-Cookie',
      serializeCookie(LOGIN_CSRF_COOKIE, csrf.cookie, {
        production,
        maxAgeSeconds: 600,
        sameSite: 'Strict'
      })
    );
    return success(request, response, { csrfToken: csrf.token });
  });

  app.post('/api/admin/v1/auth/login', async (request, response) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');

    const loginCsrfToken = request.header('x-csrf-token');
    const loginCsrfCookie = parseCookies(request.header('cookie')).get(LOGIN_CSRF_COOKIE);
    if (
      !loginCsrfToken ||
      !loginCsrfCookie ||
      !verifyLoginCsrf(hashKey, loginCsrfToken, loginCsrfCookie)
    ) {
      return failure(request, response, 403, 'CSRF_INVALID', 'Token CSRF tidak valid.');
    }

    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const rateKey = limiter.key(ip, parsed.data.tenantSlug, parsed.data.username);
    const allowance = limiter.check(rateKey);
    if (!allowance.allowed) {
      response.setHeader('Retry-After', allowance.retryAfterSeconds.toString());
      return failure(
        request,
        response,
        429,
        'RATE_LIMITED',
        'Login sementara dibatasi. Coba lagi nanti.'
      );
    }

    const identity = await repository.findLoginIdentity(
      parsed.data.tenantSlug,
      parsed.data.username
    );
    const validPassword = await verifyPassword(
      parsed.data.password,
      identity?.passwordHash ?? (await getDummyPasswordHash())
    );
    const identityActive = identity?.userStatus === 'active' && identity.tenantStatus === 'active';
    if (!identity || !validPassword || !identityActive) {
      const delay = limiter.failure(rateKey);
      if (identity)
        await repository.recordLoginFailure(identity, requestContext(request).meta.requestId);
      await sleep(delay);
      return failure(request, response, 401, 'INVALID_CREDENTIALS', 'Kredensial tidak valid.');
    }

    limiter.success(rateKey);
    const token = newOpaqueToken();
    const sessionId = generateUuidV7();
    const csrfToken = sessionCsrfToken(hashKey, sessionId);
    const current = now();
    await repository.createSession({
      sessionId,
      identity,
      tokenHash: hashOpaqueValue(token),
      csrfSecretHash: hashOpaqueValue(csrfToken),
      ipHash: keyedHash(hashKey, ip),
      userAgentHash: keyedHash(hashKey, request.header('user-agent') ?? 'unknown'),
      expiresAt: new Date(current.getTime() + SESSION_ABSOLUTE_MS),
      idleExpiresAt: new Date(current.getTime() + SESSION_IDLE_MS),
      requestId: requestContext(request).meta.requestId
    });
    response.setHeader('Set-Cookie', [
      serializeCookie(sessionCookieName, token, {
        production,
        maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_MS / 1000)
      }),
      serializeCookie(LOGIN_CSRF_COOKIE, '', { production, maxAgeSeconds: 0, sameSite: 'Strict' })
    ]);
    return success(
      request,
      response,
      currentUserSchema.parse({
        id: identity.userId,
        username: identity.username,
        displayName: identity.displayName,
        tenant: { id: identity.tenantId, slug: identity.tenantSlug, name: identity.tenantName },
        membership: { id: identity.membershipId, role: identity.role },
        permissions: [...resolvePermissions(identity.role, identity.permissionOverrides)],
        csrfToken
      }),
      201
    );
  });

  app.get('/api/admin/v1/me', authenticate, async (request, response) => {
    const session = requestContext(request).session!;
    const csrfToken = sessionCsrfToken(hashKey, session.sessionId);
    const current = now();
    await refreshSessionActivity(session, current);
    return success(
      request,
      response,
      currentUserSchema.parse({
        id: session.userId,
        username: session.username,
        displayName: session.displayName,
        tenant: { id: session.tenantId, slug: session.tenantSlug, name: session.tenantName },
        membership: { id: session.membershipId, role: session.role },
        permissions: [...requestContext(request).permissions!],
        csrfToken
      })
    );
  });

  app.post('/api/admin/v1/auth/logout', authenticate, requireCsrf, async (request, response) => {
    const session = requestContext(request).session!;
    await repository.revokeSession(
      session.sessionId,
      requestContext(request).meta.requestId,
      'user_logout'
    );
    response.setHeader(
      'Set-Cookie',
      serializeCookie(sessionCookieName, '', { production, maxAgeSeconds: 0 })
    );
    return success(request, response, { loggedOut: true });
  });

  app.post('/api/admin/v1/auth/password', authenticate, requireCsrf, async (request, response) => {
    const parsed = passwordChangeRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
    const session = requestContext(request).session!;
    if (!(await verifyPassword(parsed.data.currentPassword, session.passwordHash))) {
      return failure(request, response, 401, 'INVALID_CREDENTIALS', 'Kredensial tidak valid.');
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await repository.changePassword(
      session,
      passwordHash,
      requestContext(request).meta.requestId,
      now()
    );
    response.setHeader(
      'Set-Cookie',
      serializeCookie(sessionCookieName, '', { production, maxAgeSeconds: 0 })
    );
    return success(request, response, { changed: true });
  });

  app.get(
    '/api/admin/v1/health/dependencies',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/health/dependencies'),
    async (request, response) => success(request, response, await dependencyStatuses(repository))
  );

  app.get(
    '/api/admin/v1/overview',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/overview'),
    async (request, response) => {
      return success(request, response, await overview(requestContext(request).session!.tenantId));
    }
  );

  app.get(
    '/api/admin/v1/events/stream',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/events/stream'),
    async (request, response) => {
      const tenantId = requestContext(request).session!.tenantId;
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      const send = (event: Parameters<typeof serializeSseEvent>[0]) =>
        response.write(serializeSseEvent(event));
      const unsubscribe = eventHub.subscribe(tenantId, send);
      const lastEventId = request.header('last-event-id');
      const replay =
        lastEventId && lastEventId.length <= 128 ? eventHub.replay(tenantId, lastEventId) : [];
      for (const event of replay) send(event);
      if (replay.length === 0) await publishOverview(tenantId);
      const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
      request.once('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    }
  );

  app.get(
    '/api/admin/v1/session',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/session'),
    async (request, response) => {
      const state = await repository.getWhatsAppState(requestContext(request).session!.tenantId);
      return success(request, response, {
        adapter: state.adapter,
        state: state.state,
        connectedAt: state.connectedAt?.toISOString() ?? null,
        lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() ?? null,
        lastErrorCode: state.lastErrorCode,
        revision: state.revision,
        updatedAt: state.updatedAt.toISOString()
      });
    }
  );

  app.get(
    '/api/admin/v1/session/qr',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/session/qr'),
    async (request, response) => {
      const provider = options.qrProvider;
      if (!provider) {
        return failure(
          request,
          response,
          503,
          'QR_NOT_AVAILABLE',
          'QR belum tersedia dari adapter WhatsApp.'
        );
      }
      try {
        const entry = await provider.get(requestContext(request).session!.tenantId);
        if (!entry || entry.expiresAt <= now()) {
          return failure(
            request,
            response,
            503,
            'QR_NOT_AVAILABLE',
            'QR belum tersedia dari adapter WhatsApp.'
          );
        }
        const png = await qrCode.toBuffer(entry.qr, {
          type: 'png',
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320
        });
        response.setHeader('Cache-Control', 'no-store, max-age=0');
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Content-Length', String(png.length));
        response.setHeader('X-QR-Expires-At', entry.expiresAt.toISOString());
        response.setHeader('Pragma', 'no-cache');
        return response.status(200).end(png);
      } catch {
        return failure(
          request,
          response,
          503,
          'QR_NOT_AVAILABLE',
          'QR belum tersedia dari adapter WhatsApp.'
        );
      }
    }
  );

  app.post(
    '/api/admin/v1/session/reconnect',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/session/reconnect'),
    requireCsrf,
    async (request, response) => {
      const parsed = sessionReconnectRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      const session = requestContext(request).session!;
      const state = await repository.updateWhatsAppState({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        expectedRevision: parsed.data.expectedRevision,
        state: 'reconnecting',
        requestId: requestContext(request).meta.requestId,
        action: 'whatsapp.session.reconnect_requested'
      });
      if (state) {
        try {
          await options.whatsappSessionController?.reconnect(session.tenantId);
        } catch {
          return failure(
            request,
            response,
            503,
            'WHATSAPP_CONTROL_UNAVAILABLE',
            'Adapter WhatsApp belum dapat menjalankan reconnect.'
          );
        }
        await publishOverview(session.tenantId);
      }
      return state
        ? success(request, response, { state: state.state, revision: state.revision })
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'State telah berubah. Muat ulang data.'
          );
    }
  );

  app.post(
    '/api/admin/v1/session/disconnect',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/session/disconnect'),
    requireCsrf,
    async (request, response) => {
      const parsed = sessionDisconnectRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Konfirmasi tidak valid.');
      const session = requestContext(request).session!;
      const state = await repository.updateWhatsAppState({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        expectedRevision: parsed.data.expectedRevision,
        state: 'disconnected',
        requestId: requestContext(request).meta.requestId,
        action: 'whatsapp.session.disconnected'
      });
      if (state) {
        try {
          await options.whatsappSessionController?.disconnect(session.tenantId);
        } catch {
          return failure(
            request,
            response,
            503,
            'WHATSAPP_CONTROL_UNAVAILABLE',
            'Adapter WhatsApp belum dapat memutus koneksi.'
          );
        }
        await publishOverview(session.tenantId);
      }
      return state
        ? success(request, response, { state: state.state, revision: state.revision })
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'State telah berubah. Muat ulang data.'
          );
    }
  );

  app.post(
    '/api/admin/v1/session/reset',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/session/reset'),
    requireCsrf,
    async (request, response) => {
      const parsed = sessionResetRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Konfirmasi reset tidak valid.');
      const session = requestContext(request).session!;
      const state = await repository.updateWhatsAppState({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        expectedRevision: parsed.data.expectedRevision,
        state: 'logged_out',
        reason: parsed.data.reason,
        requestId: requestContext(request).meta.requestId,
        action: 'whatsapp.session.reset'
      });
      if (state) await publishOverview(session.tenantId);
      return state
        ? success(request, response, { state: state.state, revision: state.revision })
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'State telah berubah. Muat ulang data.'
          );
    }
  );

  app.get(
    '/api/admin/v1/safety/stats',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/safety/stats'),
    async (request, response) => {
      const state = await repository.getSafetyState(requestContext(request).session!.tenantId);
      return success(request, response, {
        ...state,
        updatedAt: state.updatedAt.toISOString()
      });
    }
  );

  const safetyMutation =
    (sendingPaused: boolean, action: string) => async (request: Request, response: Response) => {
      const parsed = revisionedReasonRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      const session = requestContext(request).session!;
      const state = await repository.updateSafetyState({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        expectedRevision: parsed.data.expectedRevision,
        sendingPaused,
        reason: parsed.data.reason,
        requestId: requestContext(request).meta.requestId,
        action
      });
      if (state) await publishOverview(session.tenantId);
      return state
        ? success(request, response, { ...state, updatedAt: state.updatedAt.toISOString() })
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'State telah berubah. Muat ulang data.'
          );
    };

  app.post(
    '/api/admin/v1/safety/pause',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/safety/pause'),
    requireCsrf,
    safetyMutation(true, 'safety.sending.paused')
  );
  app.post(
    '/api/admin/v1/safety/resume',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/safety/resume'),
    requireCsrf,
    safetyMutation(false, 'safety.sending.resumed')
  );
  app.post(
    '/api/admin/v1/safety/reset',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/safety/reset'),
    requireCsrf,
    async (request, response) => {
      if (process.env.ENABLE_SAFETY_RESET !== 'true') {
        return failure(
          request,
          response,
          403,
          'FEATURE_DISABLED',
          'Safety reset tidak diaktifkan.'
        );
      }
      const parsed = safetyResetRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Konfirmasi reset tidak valid.');
      const session = requestContext(request).session!;
      const state = await repository.updateSafetyState({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        expectedRevision: parsed.data.expectedRevision,
        sendingPaused: true,
        killSwitch: false,
        reason: parsed.data.reason,
        requestId: requestContext(request).meta.requestId,
        action: 'safety.state.reset'
      });
      if (state) await publishOverview(session.tenantId);
      return state
        ? success(request, response, { ...state, updatedAt: state.updatedAt.toISOString() })
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'State telah berubah. Muat ulang data.'
          );
    }
  );

  app.get(
    '/api/admin/v1/audit',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/audit'),
    async (request, response) => {
      const parsed = cursorPaginationQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      const session = requestContext(request).session!;
      const page = await repository.listAudit(
        session.tenantId,
        parsed.data.cursor,
        parsed.data.limit
      );
      return response.json({
        data: page.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        meta: {
          ...requestContext(request).meta,
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null
        }
      });
    }
  );

  app.get(
    '/api/admin/v1/ai/integration',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/integration'),
    async (request, response) => {
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      return success(
        request,
        response,
        await aiRepository.getIntegration(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/integration/activate',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/integration/activate'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiIntegrationActivationSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Aktivasi AI tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.activate(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/ai/integration/deactivate',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/integration/deactivate'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiIntegrationDeactivateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Deaktivasi AI tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.deactivate(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.get(
    '/api/admin/v1/ai/provider-connections',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/provider-connections'),
    async (request, response) => {
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      return success(
        request,
        response,
        await aiRepository.listConnections(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/provider-connections',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/provider-connections'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiProviderConnectionCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Koneksi AI tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await aiRepository.createConnection(
            session.tenantId,
            session.userId,
            parsed.data,
            requestContext(request).meta.requestId
          ),
          201
        );
      } catch {
        return failure(
          request,
          response,
          409,
          'CONNECTION_CONFLICT',
          'Nama koneksi sudah digunakan.'
        );
      }
    }
  );

  app.post(
    '/api/admin/v1/ai/provider-connections/:id',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/provider-connections/:id'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiProviderConnectionUpdateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Koneksi AI tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.updateConnection(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/ai/provider-connections/:id/credential',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/provider-connections/:id/credential'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiCredentialReplaceSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Kredensial AI tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.replaceCredential(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/ai/provider-connections/:id/credential/delete',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/provider-connections/:id/credential/delete'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiCredentialDeleteSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Penghapusan tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.deleteCredential(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/ai/provider-connections/:id/test',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/provider-connections/:id/test'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiConnectionTestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Uji koneksi tidak valid.');
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const session = requestContext(request).session!;
      const result = await aiRepository.testConnection(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.expectedRevision,
        parsed.data.reason,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.get(
    '/api/admin/v1/ai/provider-connections/:id/models',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/provider-connections/:id/models'),
    async (request, response) => {
      if (!aiRepository)
        return failure(request, response, 503, 'AI_UNAVAILABLE', 'Konfigurasi AI belum tersedia.');
      const result = await aiRepository.listModels(
        requestContext(request).session!.tenantId,
        routeId(request)
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : aiFailure(request, response, result);
    }
  );

  app.post('/internal/v1/whatsapp/inbound', async (request, response) => {
    if (
      !internalToken ||
      !verifyWhatsAppInternalToken(internalToken, request.header('authorization'))
    ) {
      return failure(request, response, 401, 'UNAUTHENTICATED', 'Internal authentication failed.');
    }
    if (!messagingRepository) {
      return failure(request, response, 503, 'MESSAGING_UNAVAILABLE', 'Messaging belum tersedia.');
    }
    const parsed = inboundProviderEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return failure(request, response, 400, 'INVALID_REQUEST', 'Provider event tidak valid.');
    }
    const result = await messagingRepository.ingestInbound({
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
      requestId: requestContext(request).meta.requestId
    });
    if (!result.duplicate) {
      eventHub.publish(
        parsed.data.tenantId,
        parsed.data.fromMe ? 'message.outbound' : 'message.inbound',
        {
          conversationId: result.conversationId,
          messageId: result.messageId,
          occurredAt: parsed.data.occurredAt
        }
      );
    }
    if (result.ruleOutboxMessageId && options.outboxEnqueuer) {
      await options.outboxEnqueuer
        .enqueue(parsed.data.tenantId, result.ruleOutboxMessageId)
        .catch(() => undefined);
    }
    let aiAutomation: {
      traceId: string | null;
      messageId: string;
      outboxMessageId: string;
      handoffTaskId: string | null;
      notificationOutboxMessageId: string | null;
    } | null = null;
    if (shouldRunAiAutomation(result)) {
      await options.whatsappSessionController
        ?.presence?.(parsed.data.tenantId, parsed.data.senderJid, 'composing')
        .catch(() => undefined);
      try {
        const conversationContext = await messagingRepository
          .recentConversationContext(
            parsed.data.tenantId,
            result.conversationId,
            result.messageId,
            5
          )
          .catch(() => []);
        const grounded = knowledgeRepository
          ? await knowledgeRepository.answer(
              parsed.data.tenantId,
              parsed.data.content,
              requestContext(request).meta.requestId,
              conversationContext
            )
          : {
              id: null,
              status: 'handoff' as const,
              answer: CUSTOMER_ADMIN_HANDOFF_RESPONSE,
              shouldHandoff: true,
              fallbackReason: 'knowledge_unavailable'
            };
        const automated = await messagingRepository.createAutomatedInboundResponse({
          tenantId: parsed.data.tenantId,
          conversationId: result.conversationId,
          triggerMessageId: result.messageId,
          content: grounded.answer,
          shouldHandoff: grounded.shouldHandoff,
          reasonCode: grounded.fallbackReason ?? 'ai_requested_handoff',
          traceId: grounded.id,
          now: new Date(parsed.data.occurredAt),
          customerQuestion: parsed.data.content,
          ...(options.csNotificationPhone
            ? { csNotificationPhone: options.csNotificationPhone }
            : {})
        });
        if (automated) {
          aiAutomation = { traceId: grounded.id, ...automated };
          await options.outboxEnqueuer
            ?.enqueue(parsed.data.tenantId, automated.outboxMessageId)
            .catch(() => undefined);
          if (automated.notificationOutboxMessageId) {
            await options.outboxEnqueuer
              ?.enqueue(parsed.data.tenantId, automated.notificationOutboxMessageId)
              .catch(() => undefined);
          }
        }
      } finally {
        await options.whatsappSessionController
          ?.presence?.(parsed.data.tenantId, parsed.data.senderJid, 'paused')
          .catch(() => undefined);
      }
    }
    return success(request, response, { ...result, aiAutomation }, result.duplicate ? 200 : 202);
  });

  app.get(
    '/api/admin/v1/templates',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/templates'),
    async (request, response) => {
      const parsed = templateListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Filter template tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const result = await templateRepository.list(
        requestContext(request).session!.tenantId,
        parsed.data
      );
      return response.json({
        data: result.items,
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  app.post(
    '/api/admin/v1/templates',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates'),
    requireCsrf,
    async (request, response) => {
      const parsed = templateCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Template tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await templateRepository.create({
            ...parsed.data,
            tenantId: session.tenantId,
            actorUserId: session.userId,
            requestId: requestContext(request).meta.requestId
          }),
          201
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.post(
    '/api/admin/v1/templates/preview',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates/preview'),
    requireCsrf,
    async (request, response) => {
      const parsed = templatePreviewSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Preview tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      try {
        return success(
          request,
          response,
          await templateRepository.preview(requestContext(request).session!.tenantId, parsed.data)
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.get(
    '/api/admin/v1/templates/:id',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/templates/:id'),
    async (request, response) => {
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const template = await templateRepository.get(
        requestContext(request).session!.tenantId,
        routeId(request)
      );
      return template
        ? success(request, response, template)
        : failure(request, response, 404, 'NOT_FOUND', 'Template tidak ditemukan.');
    }
  );

  app.post(
    '/api/admin/v1/templates/:id/versions',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates/:id/versions'),
    requireCsrf,
    async (request, response) => {
      const parsed = templateVersionCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Versi template tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await templateRepository.createVersion({
            ...parsed.data,
            templateId: routeId(request),
            tenantId: session.tenantId,
            actorUserId: session.userId,
            requestId: requestContext(request).meta.requestId
          }),
          201
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.post(
    '/api/admin/v1/templates/:id/publish',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates/:id/publish'),
    requireCsrf,
    async (request, response) => {
      const parsed = templatePublishSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Publikasi tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await templateRepository.publish({
            ...parsed.data,
            templateId: routeId(request),
            tenantId: session.tenantId,
            actorUserId: session.userId,
            requestId: requestContext(request).meta.requestId,
            now: now()
          })
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.post(
    '/api/admin/v1/templates/:id/duplicate',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates/:id/duplicate'),
    requireCsrf,
    async (request, response) => {
      const parsed = templateDuplicateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Nama duplikat tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await templateRepository.duplicate({
            sourceId: routeId(request),
            name: parsed.data.name,
            tenantId: session.tenantId,
            actorUserId: session.userId,
            requestId: requestContext(request).meta.requestId
          }),
          201
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.post(
    '/api/admin/v1/templates/:id/lifecycle',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/templates/:id/lifecycle'),
    requireCsrf,
    async (request, response) => {
      const parsed = templateLifecycleSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Lifecycle tidak valid.');
      if (!templateRepository)
        return failure(request, response, 503, 'TEMPLATE_UNAVAILABLE', 'Template belum tersedia.');
      const session = requestContext(request).session!;
      try {
        return success(
          request,
          response,
          await templateRepository.lifecycle({
            ...parsed.data,
            templateId: routeId(request),
            tenantId: session.tenantId,
            actorUserId: session.userId,
            requestId: requestContext(request).meta.requestId
          })
        );
      } catch (error) {
        return templateFailure(request, response, error);
      }
    }
  );

  app.get(
    '/api/admin/v1/contacts',
    authenticate,
    requirePermission('contacts.read'),
    async (request, response) => {
      const parsed = contactListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.listContacts(
        requestContext(request).session!.tenantId,
        parsed.data
      );
      return response.json({
        data: result.items,
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  app.post(
    '/api/admin/v1/contacts',
    authenticate,
    requirePermission('messages.send'),
    requireCsrf,
    async (request, response) => {
      const parsed = contactCreateRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Kontak tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      try {
        const result = await messagingRepository.createContact(
          requestContext(request).session!.tenantId,
          parsed.data
        );
        return success(request, response, result.contact, result.created ? 201 : 200);
      } catch {
        return failure(request, response, 400, 'INVALID_PHONE', 'Nomor Indonesia tidak valid.');
      }
    }
  );

  app.get(
    '/api/admin/v1/contacts/:id',
    authenticate,
    requirePermission('contacts.read'),
    async (request, response) => {
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const contact = await messagingRepository.getContact(
        requestContext(request).session!.tenantId,
        routeId(request)
      );
      return contact
        ? success(request, response, contact)
        : failure(request, response, 404, 'NOT_FOUND', 'Kontak tidak ditemukan.');
    }
  );

  app.get(
    '/api/admin/v1/conversations',
    authenticate,
    requirePermission('messages.read'),
    async (request, response) => {
      const parsed = conversationListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.listConversations(
        requestContext(request).session!.tenantId,
        parsed.data
      );
      return response.json({
        data: result.items,
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  app.get(
    '/api/admin/v1/conversations/:id/messages',
    authenticate,
    requirePermission('messages.read'),
    async (request, response) => {
      const parsed = messageListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.listMessages(
        requestContext(request).session!.tenantId,
        routeId(request),
        parsed.data
      );
      if (!result)
        return failure(request, response, 404, 'NOT_FOUND', 'Percakapan tidak ditemukan.');
      return response.json({
        data: { conversation: result.conversation, messages: result.items },
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  app.post(
    '/api/admin/v1/messages',
    authenticate,
    requirePermission('messages.send'),
    requireCsrf,
    async (request, response) => {
      const parsed = createMessageRequestSchema.safeParse(request.body);
      const idempotencyKey = request.header('idempotency-key');
      if (!parsed.success || !idempotencyKey || !/^[a-zA-Z0-9._:-]{8,128}$/u.test(idempotencyKey)) {
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Pesan atau Idempotency-Key tidak valid.'
        );
      }
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const [safety, whatsapp] = await Promise.all([
        repository.getSafetyState(session.tenantId),
        repository.getWhatsAppState(session.tenantId)
      ]);
      if (safety.sendingPaused || safety.killSwitch) {
        return failure(request, response, 409, 'SENDING_PAUSED', 'Pengiriman sedang dijeda.');
      }
      if (whatsapp.state !== 'connected') {
        return failure(
          request,
          response,
          409,
          'WHATSAPP_NOT_CONNECTED',
          'WhatsApp belum terhubung.'
        );
      }
      const normalizedRequest = {
        ...parsed.data,
        ...(parsed.data.phone ? { phone: normalizeIndonesianPhone(parsed.data.phone) } : {})
      };
      const requestHash = createHash('sha256')
        .update(JSON.stringify(normalizedRequest), 'utf8')
        .digest('hex');
      try {
        const result = await messagingRepository.createOutbound({
          ...normalizedRequest,
          scheduledAt: normalizedRequest.scheduledAt
            ? new Date(normalizedRequest.scheduledAt)
            : undefined,
          tenantId: session.tenantId,
          actorUserId: session.userId,
          idempotencyKey,
          requestHash,
          source: 'manual',
          requestId: requestContext(request).meta.requestId,
          now: now()
        });
        let dispatchSignal = false;
        if (!result.replayed && options.outboxEnqueuer) {
          dispatchSignal = await options.outboxEnqueuer
            .enqueue(
              session.tenantId,
              result.outboxMessageId,
              normalizedRequest.scheduledAt ? new Date(normalizedRequest.scheduledAt) : undefined
            )
            .then(() => true)
            .catch(() => false);
        }
        return success(request, response, { ...result, dispatchSignal }, 202);
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'IDEMPOTENCY_CONFLICT')
          return failure(
            request,
            response,
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key sudah digunakan untuk request lain.'
          );
        if (code === 'CONTACT_NOT_FOUND' || code === 'REPLY_NOT_FOUND')
          return failure(request, response, 404, 'NOT_FOUND', 'Resource tidak ditemukan.');
        if (code === 'UNSAFE_RECIPIENT' || code === 'RECIPIENT_OPTED_OUT')
          return failure(request, response, 409, code, 'Penerima tidak aman untuk pengiriman.');
        if (code === 'TEMPLATE_CHECKLIST_REQUIRED')
          return failure(
            request,
            response,
            409,
            code,
            'Checklist wajib harus dipenuhi sebelum masuk outbox.'
          );
        if (code.startsWith('TEMPLATE_') || code === 'MESSAGE_CONTENT_REQUIRED')
          return failure(request, response, 400, code, 'Pilihan template tidak valid.');
        return failure(request, response, 400, 'INVALID_REQUEST', 'Pesan tidak dapat dibuat.');
      }
    }
  );

  app.get(
    '/api/admin/v1/messages/:id',
    authenticate,
    requirePermission('messages.read'),
    async (request, response) => {
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const message = await messagingRepository.getMessage(
        requestContext(request).session!.tenantId,
        routeId(request)
      );
      return message
        ? success(request, response, message)
        : failure(request, response, 404, 'NOT_FOUND', 'Pesan tidak ditemukan.');
    }
  );

  app.get(
    '/api/admin/v1/outbox',
    authenticate,
    requirePermission('messages.read'),
    async (request, response) => {
      const parsed = outboxListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.listOutbox(
        requestContext(request).session!.tenantId,
        parsed.data
      );
      return response.json({
        data: result.items,
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  const outboxAction =
    (action: 'cancel' | 'retry') => async (request: Request, response: Response) => {
      const parsed = outboxMutationRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Alasan tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result =
        action === 'cancel'
          ? await messagingRepository.cancelOutbox(
              session.tenantId,
              session.userId,
              routeId(request),
              parsed.data.reason,
              requestContext(request).meta.requestId,
              now()
            )
          : await messagingRepository.retryOutbox(
              session.tenantId,
              session.userId,
              routeId(request),
              parsed.data.reason,
              requestContext(request).meta.requestId,
              now()
            );
      if (result === 'not_found')
        return failure(request, response, 404, 'NOT_FOUND', 'Outbox tidak ditemukan.');
      if (result === 'invalid_state')
        return failure(
          request,
          response,
          409,
          'INVALID_STATE',
          'State outbox tidak mengizinkan aksi.'
        );
      if (action === 'retry' && typeof result === 'object' && options.outboxEnqueuer) {
        await options.outboxEnqueuer
          .enqueue(session.tenantId, result.outboxMessageId)
          .catch(() => undefined);
      }
      return success(request, response, typeof result === 'string' ? { status: result } : result);
    };

  app.post(
    '/api/admin/v1/outbox/:id/cancel',
    authenticate,
    requirePermission('messages.retry'),
    requireCsrf,
    outboxAction('cancel')
  );
  app.post(
    '/api/admin/v1/outbox/:id/retry',
    authenticate,
    requirePermission('messages.retry'),
    requireCsrf,
    outboxAction('retry')
  );
  app.post(
    '/api/admin/v1/outbox/:id/reconcile',
    authenticate,
    requirePermission('messages.retry'),
    requireCsrf,
    async (request, response) => {
      const parsed = outboxReconcileRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Rekonsiliasi tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.reconcileOutbox(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.outcome,
        parsed.data.reason,
        requestContext(request).meta.requestId,
        now()
      );
      if (result === 'not_found')
        return failure(request, response, 404, 'NOT_FOUND', 'Outbox tidak ditemukan.');
      if (result === 'invalid_state')
        return failure(
          request,
          response,
          409,
          'INVALID_STATE',
          'Hanya state unknown yang dapat direkonsiliasi.'
        );
      return success(request, response, result);
    }
  );

  app.get(
    '/api/admin/v1/handoff-notification-settings',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/handoff-notification-settings'),
    async (request, response) => {
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      return success(
        request,
        response,
        await messagingRepository.getHandoffNotificationSetting(
          requestContext(request).session!.tenantId
        )
      );
    }
  );

  app.post(
    '/api/admin/v1/handoff-notification-settings',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/handoff-notification-settings'),
    requireCsrf,
    async (request, response) => {
      const parsed = handoffNotificationUpdateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return failure(request, response, 400, 'INVALID_REQUEST', 'Konfigurasi CS tidak valid.');
      }
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.updateHandoffNotificationSetting({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        phone: parsed.data.phone,
        enabled: parsed.data.enabled,
        expectedRevision: parsed.data.expectedRevision,
        reason: parsed.data.reason,
        requestId: requestContext(request).meta.requestId
      });
      if (result.status === 'revision_conflict') {
        return failure(
          request,
          response,
          409,
          'REVISION_CONFLICT',
          'Konfigurasi berubah di tab lain. Muat ulang lalu coba lagi.'
        );
      }
      return success(request, response, result.value);
    }
  );

  app.get(
    '/api/admin/v1/handoffs',
    authenticate,
    requirePermission('handoffs.read'),
    async (request, response) => {
      const parsed = handoffListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.listHandoffs(
        requestContext(request).session!.tenantId,
        parsed.data
      );
      return response.json({
        data: result.items,
        meta: {
          ...requestContext(request).meta,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null
        }
      });
    }
  );

  app.post(
    '/api/admin/v1/handoffs',
    authenticate,
    requirePermission('handoffs.manage'),
    requireCsrf,
    async (request, response) => {
      const parsed = handoffCreateRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Handoff tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      try {
        const result = await messagingRepository.createHandoff(
          session.tenantId,
          session.userId,
          parsed.data,
          requestContext(request).meta.requestId
        );
        return success(request, response, result.task, result.created ? 201 : 200);
      } catch {
        return failure(
          request,
          response,
          404,
          'NOT_FOUND',
          'Percakapan atau pesan tidak ditemukan.'
        );
      }
    }
  );

  app.post(
    '/api/admin/v1/handoffs/:id/assign',
    authenticate,
    requirePermission('handoffs.manage'),
    requireCsrf,
    async (request, response) => {
      const parsed = handoffAssignRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Assignment tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.assignHandoff(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.assigneeUserId,
        parsed.data.reason,
        requestContext(request).meta.requestId,
        now()
      );
      if (result === 'not_found')
        return failure(request, response, 404, 'NOT_FOUND', 'Handoff tidak ditemukan.');
      if (result === 'invalid_assignee')
        return failure(
          request,
          response,
          400,
          'INVALID_ASSIGNEE',
          'Assignee bukan anggota tenant.'
        );
      return success(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/handoffs/:id/resolve',
    authenticate,
    requirePermission('handoffs.manage'),
    requireCsrf,
    async (request, response) => {
      const parsed = handoffResolveRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Resolution note tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.resolveHandoff(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.resolutionNote,
        requestContext(request).meta.requestId,
        now()
      );
      return result
        ? success(request, response, result)
        : failure(request, response, 404, 'NOT_FOUND', 'Handoff tidak ditemukan.');
    }
  );

  app.get(
    '/api/admin/v1/chatbot/config',
    authenticate,
    requirePermission('chatbot.read'),
    async (request, response) => {
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      return success(
        request,
        response,
        await messagingRepository.getRuleConfig(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/chatbot/config',
    authenticate,
    requirePermission('chatbot.manage'),
    requireCsrf,
    async (request, response) => {
      const parsed = chatbotConfigRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Konfigurasi rule tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.saveRuleDraft(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result
        ? success(request, response, result)
        : failure(
            request,
            response,
            409,
            'REVISION_CONFLICT',
            'Rule telah berubah. Muat ulang data.'
          );
    }
  );

  app.post(
    '/api/admin/v1/chatbot/config/:id/publish',
    authenticate,
    requirePermission('chatbot.manage'),
    requireCsrf,
    async (request, response) => {
      const parsed = chatbotPublishRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Publish request tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const session = requestContext(request).session!;
      const result = await messagingRepository.publishRuleVersion(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.expectedRevision,
        parsed.data.reason,
        requestContext(request).meta.requestId,
        now()
      );
      if (result === 'not_found')
        return failure(request, response, 404, 'NOT_FOUND', 'Draft tidak ditemukan.');
      if (result === 'conflict')
        return failure(request, response, 409, 'REVISION_CONFLICT', 'Rule telah berubah.');
      return success(request, response, result);
    }
  );

  app.post(
    '/api/admin/v1/chatbot/test',
    authenticate,
    requirePermission('chatbot.read'),
    requireCsrf,
    async (request, response) => {
      const parsed = chatbotTestRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Test input tidak valid.');
      if (!messagingRepository)
        return failure(
          request,
          response,
          503,
          'MESSAGING_UNAVAILABLE',
          'Messaging belum tersedia.'
        );
      const result = await messagingRepository.testRules(
        requestContext(request).session!.tenantId,
        parsed.data.input,
        parsed.data.versionId
      );
      return result
        ? success(request, response, result)
        : failure(request, response, 404, 'NOT_FOUND', 'Rule version tidak ditemukan.');
    }
  );

  const requireKnowledge = (request: Request, response: Response) => {
    if (!knowledgeRepository) {
      failure(request, response, 503, 'KNOWLEDGE_UNAVAILABLE', 'Knowledge belum tersedia.');
      return false;
    }
    return true;
  };

  const knowledgeMutationFailure = (
    request: Request,
    response: Response,
    status: 'not_found' | 'revision_conflict' | 'invalid_state' | 'not_ready'
  ) => {
    if (status === 'not_found')
      return failure(request, response, 404, 'NOT_FOUND', 'Resource knowledge tidak ditemukan.');
    if (status === 'revision_conflict')
      return failure(
        request,
        response,
        409,
        'REVISION_CONFLICT',
        'Data telah berubah. Muat ulang.'
      );
    if (status === 'invalid_state')
      return failure(
        request,
        response,
        409,
        'INVALID_STATE',
        'Transisi lifecycle tidak diizinkan.'
      );
    return failure(request, response, 409, 'KNOWLEDGE_NOT_READY', 'Knowledge belum siap.');
  };

  app.get(
    '/api/admin/v1/ai/knowledge/categories',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/knowledge/categories'),
    async (request, response) => {
      if (!requireKnowledge(request, response)) return;
      return success(
        request,
        response,
        await knowledgeRepository!.listCategories(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/knowledge/categories',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/knowledge/categories'),
    requireCsrf,
    async (request, response) => {
      const parsed = knowledgeCategoryCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Kategori tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await knowledgeRepository!.createCategory(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : knowledgeMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/knowledge',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/knowledge'),
    async (request, response) => {
      const parsed = knowledgeListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Filter knowledge tidak valid.');
      if (!requireKnowledge(request, response)) return;
      return success(
        request,
        response,
        await knowledgeRepository!.listItems(
          requestContext(request).session!.tenantId,
          parsed.data.status,
          parsed.data.query,
          parsed.data.limit
        )
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/knowledge',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/knowledge'),
    requireCsrf,
    async (request, response) => {
      const parsed = knowledgeItemCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Knowledge item tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await knowledgeRepository!.createItem(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : knowledgeMutationFailure(request, response, result.status);
    }
  );

  app.post(
    '/api/admin/v1/ai/knowledge/:id',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/knowledge/:id'),
    requireCsrf,
    async (request, response) => {
      const parsed = knowledgeItemUpdateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Perubahan knowledge tidak valid.'
        );
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await knowledgeRepository!.updateItem(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : knowledgeMutationFailure(request, response, result.status);
    }
  );

  app.post(
    '/api/admin/v1/ai/knowledge/:id/lifecycle',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/knowledge/:id/lifecycle'),
    requireCsrf,
    async (request, response) => {
      const parsed = knowledgeLifecycleTransitionSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Transisi knowledge tidak valid.'
        );
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      if (
        parsed.data.target === 'published' &&
        !requestContext(request).permissions?.has('knowledge.publish')
      ) {
        return failure(request, response, 403, 'FORBIDDEN', 'Izin publish diperlukan.');
      }
      const result = await knowledgeRepository!.transitionItem(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      if (result.status !== 'ok') return knowledgeMutationFailure(request, response, result.status);
      if (['published', 'archived'].includes(parsed.data.target)) {
        await options.knowledgeEnqueuer?.reindex(session.tenantId).catch(() => undefined);
      }
      return success(request, response, result.value);
    }
  );

  app.get(
    '/api/admin/v1/ai/documents',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/documents'),
    async (request, response) => {
      const parsed = documentListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Filter dokumen tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const documents = await knowledgeRepository!.listDocuments(
        requestContext(request).session!.tenantId,
        parsed.data.state,
        parsed.data.limit
      );
      return success(
        request,
        response,
        documents.map((document) => ({ ...document, byteSize: Number(document.byteSize) }))
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/documents',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/documents'),
    requireCsrf,
    async (request, response) => {
      if (!requireKnowledge(request, response)) return;
      if (!options.knowledgeStorage || !options.knowledgeEnqueuer) {
        return failure(
          request,
          response,
          503,
          'KNOWLEDGE_UNAVAILABLE',
          'Pipeline dokumen belum siap.'
        );
      }
      const mime = knowledgeMimeSchema.safeParse(request.header('content-type')?.split(';')[0]);
      const rawFilename = request.header('x-file-name');
      const filename = rawFilename ? basename(rawFilename.normalize('NFKC')).trim() : '';
      const extension = filename.split('.').pop()?.toLocaleLowerCase('en-US');
      const expectedExtension: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'text/plain': 'txt'
      };
      if (
        !mime.success ||
        !filename ||
        filename.length > 255 ||
        [...filename].some((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code < 32 || code === 127;
        }) ||
        extension !== expectedExtension[mime.data]
      ) {
        return failure(
          request,
          response,
          400,
          'INVALID_DOCUMENT',
          'Nama atau MIME dokumen tidak valid.'
        );
      }
      const chunks: Buffer[] = [];
      const digest = createHash('sha256');
      let size = 0;
      for await (const value of request) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
        size += chunk.length;
        if (size > 10_485_760) {
          return failure(request, response, 413, 'DOCUMENT_TOO_LARGE', 'Dokumen melebihi 10 MiB.');
        }
        digest.update(chunk);
        chunks.push(chunk);
      }
      if (size === 0) return failure(request, response, 400, 'EMPTY_DOCUMENT', 'Dokumen kosong.');
      const session = requestContext(request).session!;
      const documentId = generateUuidV7();
      const objectKey = privateObjectKey(session.tenantId, documentId, 'quarantine');
      const content = Buffer.concat(chunks);
      const sha256 = digest.digest('hex');
      const stored = await putPrivateObject(
        options.knowledgeStorage.client,
        options.knowledgeStorage.config.buckets.quarantine,
        objectKey,
        content,
        mime.data,
        sha256
      );
      try {
        const document = await knowledgeRepository!.createDocument(
          session.tenantId,
          session.userId,
          {
            id: documentId,
            filename,
            mime: mime.data,
            size,
            sha256,
            bucket: options.knowledgeStorage.config.buckets.quarantine,
            objectKey,
            versionId: stored.versionId,
            etag: stored.etag
          },
          requestContext(request).meta.requestId
        );
        const dispatchSignal = await options.knowledgeEnqueuer
          .document(session.tenantId, documentId)
          .then(() => true)
          .catch(() => false);
        return success(
          request,
          response,
          { ...document, byteSize: Number(document.byteSize), dispatchSignal },
          202
        );
      } catch (error) {
        await options.knowledgeStorage.client
          .removeObject(options.knowledgeStorage.config.buckets.quarantine, objectKey)
          .catch(() => undefined);
        throw error;
      }
    }
  );

  app.get(
    '/api/admin/v1/ai/documents/:id/download',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/documents/:id/download'),
    async (request, response) => {
      if (!requireKnowledge(request, response)) return;
      if (!options.knowledgeStorage)
        return failure(request, response, 503, 'KNOWLEDGE_UNAVAILABLE', 'Storage belum siap.');
      const document = await knowledgeRepository!.getDocument(
        requestContext(request).session!.tenantId,
        routeId(request)
      );
      if (!document)
        return failure(request, response, 404, 'NOT_FOUND', 'Dokumen tidak ditemukan.');
      const object =
        document.storageObjects.find(({ role }) => role === 'source') ??
        document.storageObjects.find(({ role }) => role === 'quarantine');
      if (!object)
        return failure(request, response, 409, 'OBJECT_UNAVAILABLE', 'Object tidak tersedia.');
      const stream = await options.knowledgeStorage.client.getObject(
        object.bucket,
        object.objectKey,
        object.versionId === 'unversioned' ? undefined : { versionId: object.versionId }
      );
      response.setHeader('Content-Type', document.detectedMime ?? document.declaredMime);
      response.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`
      );
      response.setHeader('Cache-Control', 'private, no-store');
      stream.on('error', () => response.destroy());
      return stream.pipe(response);
    }
  );

  const documentAction =
    (action: 'retry' | 'archive') => async (request: Request, response: Response) => {
      const parsed = documentMutationSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Mutasi dokumen tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await knowledgeRepository!.mutateDocument(
        session.tenantId,
        session.userId,
        routeId(request),
        action,
        parsed.data,
        requestContext(request).meta.requestId
      );
      if (result.status !== 'ok') return knowledgeMutationFailure(request, response, result.status);
      if (action === 'retry') {
        await options.knowledgeEnqueuer
          ?.document(session.tenantId, routeId(request))
          .catch(() => undefined);
      } else {
        await options.knowledgeEnqueuer?.reindex(session.tenantId).catch(() => undefined);
      }
      const value = result.value as { byteSize?: bigint };
      return success(
        request,
        response,
        typeof value.byteSize === 'bigint' ? { ...value, byteSize: Number(value.byteSize) } : value
      );
    };

  app.post(
    '/api/admin/v1/ai/documents/:id/retry',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/documents/:id/retry'),
    requireCsrf,
    documentAction('retry')
  );
  app.post(
    '/api/admin/v1/ai/documents/:id/archive',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/documents/:id/archive'),
    requireCsrf,
    documentAction('archive')
  );

  app.post(
    '/api/admin/v1/ai/search/test',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/search/test'),
    requireCsrf,
    async (request, response) => {
      const parsed = knowledgeSearchTestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Query pencarian tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const result = await knowledgeRepository!.search(
        requestContext(request).session!.tenantId,
        parsed.data.query,
        parsed.data.limit
      );
      return result.status === 'ok'
        ? success(request, response, {
            results: result.value,
            indexVersionId: result.indexVersionId,
            retrievalMode: result.retrievalMode
          })
        : knowledgeMutationFailure(request, response, result.status);
    }
  );

  app.post(
    '/api/admin/v1/ai/playground',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/playground'),
    requireCsrf,
    async (request, response) => {
      const parsed = ragPlaygroundSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Pertanyaan tidak valid.');
      if (!requireKnowledge(request, response)) return;
      return success(
        request,
        response,
        await knowledgeRepository!.answer(
          requestContext(request).session!.tenantId,
          parsed.data.question,
          requestContext(request).meta.requestId
        )
      );
    }
  );

  app.get(
    '/api/admin/v1/ai/prompts',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/prompts'),
    async (request, response) => {
      if (!requireKnowledge(request, response)) return;
      return success(
        request,
        response,
        await knowledgeRepository!.listPrompts(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/prompts',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/prompts'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiPromptVersionCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Prompt tidak valid.');
      if (!requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await knowledgeRepository!.savePrompt(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : knowledgeMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/traces',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/traces'),
    async (request, response) => {
      if (!requireKnowledge(request, response)) return;
      return success(
        request,
        response,
        await knowledgeRepository!.listTraces(requestContext(request).session!.tenantId)
      );
    }
  );

  const requireAiOperations = (request: Request, response: Response) => {
    if (!aiOperationsRepository) {
      failure(request, response, 503, 'AI_OPERATIONS_UNAVAILABLE', 'AI operations belum tersedia.');
      return false;
    }
    return true;
  };
  const operationsMutationFailure = (
    request: Request,
    response: Response,
    status: 'not_found' | 'invalid_state' | 'revision_conflict'
  ) => {
    if (status === 'not_found')
      return failure(
        request,
        response,
        404,
        'NOT_FOUND',
        'Resource AI operations tidak ditemukan.'
      );
    if (status === 'revision_conflict')
      return failure(
        request,
        response,
        409,
        'REVISION_CONFLICT',
        'Data telah berubah. Muat ulang.'
      );
    return failure(
      request,
      response,
      409,
      'INVALID_STATE',
      'Aksi tidak diizinkan pada status saat ini.'
    );
  };

  app.post(
    '/api/admin/v1/ai/traces/:id/feedback',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/traces/:id/feedback'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiFeedbackSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Feedback tidak valid.');
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.saveFeedback(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/unanswered',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/unanswered'),
    async (request, response) => {
      const parsed = unansweredListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Filter unanswered tidak valid.');
      if (!requireAiOperations(request, response)) return;
      return success(
        request,
        response,
        await aiOperationsRepository!.listUnanswered(
          requestContext(request).session!.tenantId,
          parsed.data.status,
          parsed.data.limit
        )
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/unanswered/:id/draft',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/unanswered/:id/draft'),
    requireCsrf,
    async (request, response) => {
      const parsed = unansweredDraftSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Draft knowledge tidak valid.');
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.createDraftFromUnanswered(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/test-cases',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/test-cases'),
    async (request, response) => {
      if (!requireAiOperations(request, response)) return;
      return success(
        request,
        response,
        await aiOperationsRepository!.listTestCases(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/test-cases',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/test-cases'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiTestCaseCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Test case tidak valid.');
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const value = await aiOperationsRepository!.createTestCases(
        session.tenantId,
        session.userId,
        [parsed.data],
        parsed.data.reason,
        requestContext(request).meta.requestId
      );
      return success(request, response, value[0], 201);
    }
  );

  app.post(
    '/api/admin/v1/ai/test-cases/import',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/test-cases/import'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiTestCaseImportSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Dataset evaluasi tidak valid.');
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      return success(
        request,
        response,
        await aiOperationsRepository!.createTestCases(
          session.tenantId,
          session.userId,
          parsed.data.cases,
          parsed.data.reason,
          requestContext(request).meta.requestId
        ),
        201
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/test-runs',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/test-runs'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiTestRunRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Permintaan test run tidak valid.'
        );
      if (!requireAiOperations(request, response) || !requireKnowledge(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.runTestCases(
        session.tenantId,
        session.userId,
        parsed.data.testCaseIds,
        parsed.data.reason,
        requestContext(request).meta.requestId,
        (question, requestId) => knowledgeRepository!.answer(session.tenantId, question, requestId)
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/analytics',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/analytics'),
    async (request, response) => {
      const parsed = aiAnalyticsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Rentang analytics tidak valid.');
      if (!requireAiOperations(request, response)) return;
      return success(
        request,
        response,
        await aiOperationsRepository!.analytics(
          requestContext(request).session!.tenantId,
          parsed.data.days
        )
      );
    }
  );

  app.get(
    '/api/admin/v1/ai/release-readiness',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/release-readiness'),
    async (request, response) => {
      if (!requireAiOperations(request, response)) return;
      return success(
        request,
        response,
        await aiOperationsRepository!.listReadiness(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/release-readiness/evaluate',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/release-readiness/evaluate'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiReadinessEvaluateSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Evaluasi readiness tidak valid.'
        );
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.evaluateReadiness(
        session.tenantId,
        session.userId,
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value, 201)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.post(
    '/api/admin/v1/ai/release-readiness/:id/decision',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/release-readiness/:id/decision'),
    requireCsrf,
    async (request, response) => {
      const parsed = aiReadinessDecisionSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(
          request,
          response,
          400,
          'INVALID_REQUEST',
          'Keputusan readiness tidak valid.'
        );
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.decideReadiness(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.get(
    '/api/admin/v1/ai/alerts',
    authenticate,
    requireRoutePermission('GET', '/api/admin/v1/ai/alerts'),
    async (request, response) => {
      if (!requireAiOperations(request, response)) return;
      return success(
        request,
        response,
        await aiOperationsRepository!.listAlerts(requestContext(request).session!.tenantId)
      );
    }
  );

  app.post(
    '/api/admin/v1/ai/alerts/:id/acknowledge',
    authenticate,
    requireRoutePermission('POST', '/api/admin/v1/ai/alerts/:id/acknowledge'),
    requireCsrf,
    async (request, response) => {
      const parsed = alertAcknowledgeSchema.safeParse(request.body);
      if (!parsed.success)
        return failure(request, response, 400, 'INVALID_REQUEST', 'Alasan alert tidak valid.');
      if (!requireAiOperations(request, response)) return;
      const session = requestContext(request).session!;
      const result = await aiOperationsRepository!.acknowledgeAlert(
        session.tenantId,
        session.userId,
        routeId(request),
        parsed.data.reason,
        requestContext(request).meta.requestId
      );
      return result.status === 'ok'
        ? success(request, response, result.value)
        : operationsMutationFailure(request, response, result.status);
    }
  );

  app.use((request, response) =>
    failure(request, response, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.')
  );
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    void error;
    void next;
    const requestId = requestContext(request).meta.requestId;
    process.stderr.write(
      `${JSON.stringify({ level: 'error', requestId, event: 'request_failed' })}\n`
    );
    return failure(request, response, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan internal.');
  });

  return app;
};
