import {
  aiCapabilitiesSchema,
  aiHealthStateSchema,
  aiProviderSchema,
  aiPurposeSchema,
  type AiCapabilities,
  type AiCredentialDelete,
  type AiCredentialReplace,
  type AiHealthState,
  type AiIntegrationActivation,
  type AiIntegrationDeactivate,
  type AiModelCandidateApply,
  type AiModelCandidateTest,
  type AiModelDiscovery,
  type AiProviderConnectionCreate,
  type AiProviderConnectionUpdate,
  type AiPurpose
} from '@raho/contracts';
import {
  generateUuidV7,
  openCredential,
  sealCredential,
  type Prisma,
  type PrismaClient
} from '@raho/db';

import {
  AiProviderAdapter,
  ProviderFailure,
  type ProviderConnectionRuntime,
  type ProviderHttpTransport
} from './ai-provider.js';

export interface AiConnectionView {
  id: string;
  name: string;
  purpose: AiPurpose;
  provider: ReturnType<typeof aiProviderSchema.parse>;
  transport: 'native' | 'compatible' | 'gateway';
  baseUrl: string | null;
  modelId: string;
  dimensions: number | null;
  taskType: string | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  generationConfig: { temperature?: number; topP?: number };
  capabilities: AiCapabilities | null;
  healthState: AiHealthState;
  lastTestErrorCode: string | null;
  lastTestedAt: string | null;
  testedRevision: number | null;
  revision: number;
  credentialConfigured: boolean;
  credentialRotatedAt: string | null;
  updatedAt: string;
}

export interface AiIntegrationView {
  id: string;
  name: string;
  activeChatConnectionId: string | null;
  activeEmbeddingConnectionId: string | null;
  activeEmbeddingIndexVersionId: string | null;
  generationEnabled: boolean;
  retrievalEnabled: boolean;
  strictGrounding: boolean;
  status: string;
  revision: number;
  updatedAt: string;
}

export type AiMutationResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'provider_failure'; category: AiHealthState }
  | { status: 'not_found' | 'revision_conflict' | 'not_ready' | 'reindex_required' };

export interface AiModelCandidateTestResult {
  modelId: string;
  healthState: 'ready';
  latencyMs: number;
  actualModel: string;
  providerRequestId: string | null;
}

export interface AiModelCandidateApplyResult {
  connection: AiConnectionView;
  integration: AiIntegrationView;
  test: AiModelCandidateTestResult;
}

export interface AiConnectionTestResult {
  connection: AiConnectionView;
  test: {
    healthState: AiHealthState;
    latencyMs: number;
    actualModel: string;
    providerRequestId: string | null;
    models: string[];
  };
}

export interface AiRepository {
  getIntegration(tenantId: string): Promise<AiIntegrationView>;
  listConnections(tenantId: string): Promise<AiConnectionView[]>;
  createConnection(
    tenantId: string,
    actorUserId: string,
    input: AiProviderConnectionCreate,
    requestId: string
  ): Promise<AiConnectionView>;
  updateConnection(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiProviderConnectionUpdate,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>>;
  replaceCredential(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiCredentialReplace,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>>;
  deleteCredential(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiCredentialDelete,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>>;
  testConnection(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    expectedRevision: number,
    reason: string,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionTestResult>>;
  listModels(tenantId: string, connectionId: string): Promise<AiMutationResult<string[]>>;
  discoverModels(tenantId: string, input: AiModelDiscovery): Promise<AiMutationResult<string[]>>;
  testModelCandidate(
    tenantId: string,
    connectionId: string,
    input: AiModelCandidateTest
  ): Promise<AiMutationResult<AiModelCandidateTestResult>>;
  applyModelCandidate(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiModelCandidateApply,
    requestId: string
  ): Promise<AiMutationResult<AiModelCandidateApplyResult>>;
  activate(
    tenantId: string,
    actorUserId: string,
    input: AiIntegrationActivation,
    requestId: string
  ): Promise<AiMutationResult<AiIntegrationView>>;
  deactivate(
    tenantId: string,
    actorUserId: string,
    input: AiIntegrationDeactivate,
    requestId: string
  ): Promise<AiMutationResult<AiIntegrationView>>;
}

type ConnectionRecord = {
  id: string;
  tenantId: string;
  credentialId: string | null;
  name: string;
  purpose: string;
  provider: string;
  transport: string;
  baseUrl: string | null;
  modelId: string;
  dimensions: number | null;
  taskType: string | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  generationConfig: unknown;
  capabilitySnapshot: unknown;
  healthState: string;
  lastTestErrorCode: string | null;
  lastTestedAt: Date | null;
  testedRevision: number | null;
  revision: number;
  updatedAt: Date;
  credential?: CredentialRecord | null;
};

type CredentialRecord = {
  encryptedCiphertext: Uint8Array;
  encryptedDataKey: Uint8Array;
  nonce: Uint8Array;
  encryptionAlgorithm: string;
  masterKeyVersion: string;
  rotatedAt: Date;
  revokedAt: Date | null;
};

const generationConfig = (value: unknown): { temperature?: number; topP?: number } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const config = value as Record<string, unknown>;
  return {
    ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
    ...(typeof config.topP === 'number' ? { topP: config.topP } : {})
  };
};

const capabilities = (value: unknown): AiCapabilities | null => {
  const parsed = aiCapabilitiesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const connectionView = (connection: ConnectionRecord): AiConnectionView => ({
  id: connection.id,
  name: connection.name,
  purpose: aiPurposeSchema.parse(connection.purpose),
  provider: aiProviderSchema.parse(connection.provider),
  transport: connection.transport as AiConnectionView['transport'],
  baseUrl: connection.baseUrl,
  modelId: connection.modelId,
  dimensions: connection.dimensions,
  taskType: connection.taskType,
  timeoutMs: connection.timeoutMs,
  maxRetries: connection.maxRetries,
  maxOutputTokens: connection.maxOutputTokens,
  generationConfig: generationConfig(connection.generationConfig),
  capabilities: capabilities(connection.capabilitySnapshot),
  healthState: aiHealthStateSchema.parse(connection.healthState),
  lastTestErrorCode: connection.lastTestErrorCode,
  lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
  testedRevision: connection.testedRevision,
  revision: connection.revision,
  credentialConfigured: Boolean(connection.credential && !connection.credential.revokedAt),
  credentialRotatedAt: connection.credential?.rotatedAt.toISOString() ?? null,
  updatedAt: connection.updatedAt.toISOString()
});

const integrationView = (integration: {
  id: string;
  name: string;
  activeChatConnectionId: string | null;
  activeEmbeddingConnectionId: string | null;
  activeEmbeddingIndexVersionId: string | null;
  generationEnabled: boolean;
  retrievalEnabled: boolean;
  strictGrounding: boolean;
  status: string;
  revision: number;
  updatedAt: Date;
}): AiIntegrationView => ({
  ...integration,
  updatedAt: integration.updatedAt.toISOString()
});

const audit = (
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
  metadata: metadata as Prisma.InputJsonValue
});

const connectionInclude = { credential: true } as const;
const prismaBytes = (value: Buffer): Uint8Array<ArrayBuffer> => Uint8Array.from(value);
class RevisionConflict extends Error {}

export class PrismaAiRepository implements AiRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly masterKey: Buffer,
    private readonly transport: ProviderHttpTransport,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async ensureIntegration(tenantId: string) {
    return this.prisma.aiIntegration.upsert({
      where: { tenantId_name: { tenantId, name: 'default' } },
      create: { id: generateUuidV7(), tenantId, name: 'default' },
      update: {}
    });
  }

  public async getIntegration(tenantId: string): Promise<AiIntegrationView> {
    return integrationView(await this.ensureIntegration(tenantId));
  }

  public async listConnections(tenantId: string): Promise<AiConnectionView[]> {
    const connections = await this.prisma.aiProviderConnection.findMany({
      where: { tenantId },
      include: connectionInclude,
      orderBy: [{ purpose: 'asc' }, { name: 'asc' }]
    });
    return connections.map(connectionView);
  }

  public async createConnection(
    tenantId: string,
    actorUserId: string,
    input: AiProviderConnectionCreate,
    requestId: string
  ): Promise<AiConnectionView> {
    const { credential, reason, ...configuration } = input;
    return this.prisma.$transaction(async (tx) => {
      let credentialId: string | undefined;
      if (credential) {
        const id = generateUuidV7();
        const sealed = sealCredential(
          credential,
          { tenantId, provider: input.provider, purpose: input.purpose },
          this.masterKey
        );
        await tx.aiProviderCredential.create({
          data: {
            id,
            tenantId,
            providerBinding: input.provider,
            purpose: input.purpose,
            encryptedCiphertext: prismaBytes(sealed.encryptedCiphertext),
            encryptedDataKey: prismaBytes(sealed.encryptedDataKey),
            nonce: prismaBytes(sealed.nonce),
            encryptionAlgorithm: sealed.encryptionAlgorithm,
            masterKeyVersion: sealed.masterKeyVersion,
            secretFingerprint: sealed.secretFingerprint,
            rotatedAt: this.now()
          }
        });
        credentialId = id;
      }
      const connection = await tx.aiProviderConnection.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          credentialId: credentialId ?? null,
          ...configuration,
          baseUrl: configuration.baseUrl ?? null,
          dimensions: configuration.dimensions ?? null,
          taskType: configuration.taskType ?? null,
          generationConfig: configuration.generationConfig as Prisma.InputJsonValue
        },
        include: connectionInclude
      });
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          'ai.connection.created',
          'AiProviderConnection',
          connection.id,
          reason,
          requestId,
          {
            provider: input.provider,
            purpose: input.purpose,
            credentialConfigured: Boolean(credential)
          }
        )
      });
      return connectionView(connection);
    });
  }

  private async disableActiveConnection(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string
  ): Promise<void> {
    await tx.aiIntegration.updateMany({
      where: { tenantId, activeChatConnectionId: connectionId },
      data: {
        activeChatConnectionId: null,
        generationEnabled: false,
        status: 'configured',
        revision: { increment: 1 }
      }
    });
    await tx.aiIntegration.updateMany({
      where: { tenantId, activeEmbeddingConnectionId: connectionId },
      data: {
        activeEmbeddingConnectionId: null,
        retrievalEnabled: false,
        status: 'configured',
        revision: { increment: 1 }
      }
    });
  }

  public async updateConnection(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiProviderConnectionUpdate,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>> {
    const existing = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      select: { id: true, revision: true }
    });
    if (!existing) return { status: 'not_found' };
    if (existing.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    const { expectedRevision, reason, ...configuration } = input;
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiProviderConnection.updateMany({
        where: { id: connectionId, tenantId, revision: expectedRevision },
        data: {
          ...configuration,
          baseUrl: configuration.baseUrl ?? null,
          dimensions: configuration.dimensions ?? null,
          taskType: configuration.taskType ?? null,
          generationConfig: configuration.generationConfig as Prisma.InputJsonValue,
          healthState: 'not_tested',
          lastTestErrorCode: null,
          testedRevision: null,
          revision: { increment: 1 }
        }
      });
      if (changed.count !== 1) return { status: 'revision_conflict' as const };
      await this.disableActiveConnection(tx, tenantId, connectionId);
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          'ai.connection.updated',
          'AiProviderConnection',
          connectionId,
          reason,
          requestId
        )
      });
      const connection = await tx.aiProviderConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: connectionInclude
      });
      return { status: 'ok' as const, value: connectionView(connection) };
    });
  }

  public async replaceCredential(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiCredentialReplace,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    if (connection.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    const sealed = sealCredential(
      input.credential,
      { tenantId, provider: connection.provider, purpose: connection.purpose },
      this.masterKey
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const credentialId = generateUuidV7();
        await tx.aiProviderCredential.create({
          data: {
            id: credentialId,
            tenantId,
            providerBinding: connection.provider,
            purpose: connection.purpose,
            encryptedCiphertext: prismaBytes(sealed.encryptedCiphertext),
            encryptedDataKey: prismaBytes(sealed.encryptedDataKey),
            nonce: prismaBytes(sealed.nonce),
            encryptionAlgorithm: sealed.encryptionAlgorithm,
            masterKeyVersion: sealed.masterKeyVersion,
            secretFingerprint: sealed.secretFingerprint,
            rotatedAt: this.now()
          }
        });
        const changed = await tx.aiProviderConnection.updateMany({
          where: { id: connectionId, tenantId, revision: input.expectedRevision },
          data: {
            credentialId,
            healthState: 'not_tested',
            lastTestErrorCode: null,
            testedRevision: null,
            revision: { increment: 1 }
          }
        });
        if (changed.count !== 1) throw new RevisionConflict();
        if (connection.credentialId) {
          await tx.aiProviderCredential.update({
            where: { id: connection.credentialId },
            data: { revokedAt: this.now() }
          });
        }
        await this.disableActiveConnection(tx, tenantId, connectionId);
        await tx.auditLog.create({
          data: audit(
            tenantId,
            actorUserId,
            'ai.credential.replaced',
            'AiProviderConnection',
            connectionId,
            input.reason,
            requestId
          )
        });
        const updated = await tx.aiProviderConnection.findUniqueOrThrow({
          where: { id: connectionId },
          include: connectionInclude
        });
        return { status: 'ok' as const, value: connectionView(updated) };
      });
    } catch (error) {
      if (error instanceof RevisionConflict) return { status: 'revision_conflict' };
      throw error;
    }
  }

  public async deleteCredential(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiCredentialDelete,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionView>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    if (connection.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiProviderConnection.updateMany({
        where: { id: connectionId, tenantId, revision: input.expectedRevision },
        data: {
          credentialId: null,
          healthState: 'not_tested',
          lastTestErrorCode: null,
          testedRevision: null,
          revision: { increment: 1 }
        }
      });
      if (changed.count !== 1) return { status: 'revision_conflict' as const };
      if (connection.credentialId) {
        await tx.aiProviderCredential.update({
          where: { id: connection.credentialId },
          data: { revokedAt: this.now() }
        });
      }
      await this.disableActiveConnection(tx, tenantId, connectionId);
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          'ai.credential.deleted',
          'AiProviderConnection',
          connectionId,
          input.reason,
          requestId
        )
      });
      const updated = await tx.aiProviderConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: connectionInclude
      });
      return { status: 'ok' as const, value: connectionView(updated) };
    });
  }

  private runtime(connection: ConnectionRecord): ProviderConnectionRuntime {
    let credential: string | null = null;
    if (connection.credential && !connection.credential.revokedAt) {
      credential = openCredential(
        {
          encryptedCiphertext: Buffer.from(connection.credential.encryptedCiphertext),
          encryptedDataKey: Buffer.from(connection.credential.encryptedDataKey),
          nonce: Buffer.from(connection.credential.nonce),
          encryptionAlgorithm: connection.credential.encryptionAlgorithm as 'AES-256-GCM',
          masterKeyVersion: connection.credential.masterKeyVersion as 'v1'
        },
        {
          tenantId: connection.tenantId,
          provider: connection.provider,
          purpose: connection.purpose
        },
        this.masterKey
      );
    }
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      purpose: aiPurposeSchema.parse(connection.purpose),
      provider: aiProviderSchema.parse(connection.provider),
      baseUrl: connection.baseUrl,
      modelId: connection.modelId,
      dimensions: connection.dimensions,
      taskType: connection.taskType,
      timeoutMs: connection.timeoutMs,
      maxRetries: connection.maxRetries,
      maxOutputTokens: connection.maxOutputTokens,
      generationConfig: generationConfig(connection.generationConfig),
      ...(capabilities(connection.capabilitySnapshot)
        ? { capabilitySnapshot: capabilities(connection.capabilitySnapshot)! }
        : {}),
      credential
    };
  }

  public async testConnection(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    expectedRevision: number,
    reason: string,
    requestId: string
  ): Promise<AiMutationResult<AiConnectionTestResult>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    if (connection.revision !== expectedRevision) return { status: 'revision_conflict' };
    let result: Awaited<ReturnType<AiProviderAdapter['testConnection']>>;
    try {
      result = await new AiProviderAdapter(
        this.runtime(connection),
        this.transport
      ).testConnection();
    } catch (error) {
      const category = error instanceof ProviderFailure ? error.category : 'unavailable';
      const updated = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.aiProviderConnection.updateMany({
          where: { id: connectionId, tenantId, revision: expectedRevision },
          data: {
            healthState: category,
            lastTestErrorCode: category,
            lastTestedAt: this.now(),
            testedRevision: null
          }
        });
        if (changed.count !== 1) return null;
        await tx.auditLog.create({
          data: audit(
            tenantId,
            actorUserId,
            'ai.connection.test_failed',
            'AiProviderConnection',
            connectionId,
            reason,
            requestId,
            { category }
          )
        });
        return tx.aiProviderConnection.findUniqueOrThrow({
          where: { id: connectionId },
          include: connectionInclude
        });
      });
      if (!updated) return { status: 'revision_conflict' };
      return {
        status: 'ok',
        value: {
          connection: connectionView(updated),
          test: {
            healthState: category,
            latencyMs: 0,
            actualModel: connection.modelId,
            providerRequestId: null,
            models: []
          }
        }
      };
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiProviderConnection.updateMany({
        where: { id: connectionId, tenantId, revision: expectedRevision },
        data: {
          healthState: result.healthState,
          lastTestErrorCode: null,
          lastTestedAt: this.now(),
          testedRevision: expectedRevision,
          capabilitySnapshot: result.capabilities as Prisma.InputJsonValue
        }
      });
      if (changed.count !== 1) return null;
      await tx.aiModelCapabilityCache.upsert({
        where: { connectionId_modelId: { connectionId, modelId: connection.modelId } },
        create: {
          id: generateUuidV7(),
          tenantId,
          connectionId,
          modelId: connection.modelId,
          capabilities: result.capabilities as Prisma.InputJsonValue,
          source: 'connection_test',
          probedAt: this.now(),
          expiresAt: new Date(this.now().getTime() + 86_400_000)
        },
        update: {
          capabilities: result.capabilities as Prisma.InputJsonValue,
          source: 'connection_test',
          probedAt: this.now(),
          expiresAt: new Date(this.now().getTime() + 86_400_000)
        }
      });
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          'ai.connection.test_succeeded',
          'AiProviderConnection',
          connectionId,
          reason,
          requestId,
          {
            healthState: result.healthState,
            latencyMs: result.latencyMs,
            actualModel: result.actualModel,
            providerRequestId: result.providerRequestId
          }
        )
      });
      return tx.aiProviderConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: connectionInclude
      });
    });
    if (!updated) return { status: 'revision_conflict' };
    return { status: 'ok', value: { connection: connectionView(updated), test: result } };
  }

  public async listModels(
    tenantId: string,
    connectionId: string
  ): Promise<AiMutationResult<string[]>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    try {
      return {
        status: 'ok',
        value: await new AiProviderAdapter(this.runtime(connection), this.transport).listModels()
      };
    } catch {
      return { status: 'not_ready' };
    }
  }

  public async discoverModels(
    tenantId: string,
    input: AiModelDiscovery
  ): Promise<AiMutationResult<string[]>> {
    try {
      let runtime: ProviderConnectionRuntime;
      if ('connectionId' in input) {
        const connection = await this.prisma.aiProviderConnection.findFirst({
          where: { id: input.connectionId, tenantId },
          include: connectionInclude
        });
        if (!connection) return { status: 'not_found' };
        runtime = this.runtime(connection);
      } else {
        runtime = {
          id: 'draft-discovery',
          tenantId,
          purpose: input.purpose,
          provider: input.provider,
          baseUrl: input.baseUrl ?? null,
          modelId: 'mock-safe',
          dimensions: null,
          taskType: null,
          timeoutMs: input.timeoutMs,
          maxRetries: 0,
          maxOutputTokens: 64,
          generationConfig: {},
          credential: input.credential ?? null
        };
      }
      const models = await new AiProviderAdapter(runtime, this.transport).listModels();
      return { status: 'ok', value: [...new Set(models)].sort() };
    } catch (error) {
      return this.providerFailure(error);
    }
  }

  private providerFailure(error: unknown): { status: 'provider_failure'; category: AiHealthState } {
    return {
      status: 'provider_failure',
      category: error instanceof ProviderFailure ? error.category : 'unavailable'
    };
  }

  private async probeModel(connection: ConnectionRecord, modelId: string) {
    const runtime = this.runtime(connection);
    const candidate = {
      ...runtime,
      modelId,
      maxRetries: 0
    };
    // A different model must not inherit the previous model's capability snapshot.
    if (modelId !== connection.modelId) delete candidate.capabilitySnapshot;
    const adapter = new AiProviderAdapter(candidate, this.transport);
    const started = performance.now();
    // Generation is the compatibility check. Model listing may be unavailable or incomplete.
    const result = await adapter.generateStructured('Return a safe JSON health response only.');
    return {
      test: {
        modelId,
        healthState: 'ready' as const,
        latencyMs: Math.max(0, Math.round(performance.now() - started)),
        actualModel: result.actualModel,
        providerRequestId: result.providerRequestId
      },
      capabilities: adapter.capabilities()
    };
  }

  public async testModelCandidate(
    tenantId: string,
    connectionId: string,
    input: AiModelCandidateTest
  ): Promise<AiMutationResult<AiModelCandidateTestResult>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    if (connection.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    if (connection.purpose !== 'chat') return { status: 'not_ready' };
    try {
      const result = await this.probeModel(connection, input.modelId);
      const unchanged = await this.prisma.aiProviderConnection.findFirst({
        where: { id: connectionId, tenantId, revision: input.expectedRevision },
        select: { id: true }
      });
      return unchanged ? { status: 'ok', value: result.test } : { status: 'revision_conflict' };
    } catch (error) {
      return this.providerFailure(error);
    }
  }

  public async applyModelCandidate(
    tenantId: string,
    actorUserId: string,
    connectionId: string,
    input: AiModelCandidateApply,
    requestId: string
  ): Promise<AiMutationResult<AiModelCandidateApplyResult>> {
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: connectionInclude
    });
    if (!connection) return { status: 'not_found' };
    if (connection.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    if (connection.purpose !== 'chat') return { status: 'not_ready' };
    const integration = await this.ensureIntegration(tenantId);
    if (integration.revision !== input.expectedIntegrationRevision) {
      return { status: 'revision_conflict' };
    }
    let probe: Awaited<ReturnType<PrismaAiRepository['probeModel']>>;
    try {
      probe = await this.probeModel(connection, input.modelId);
    } catch (error) {
      return this.providerFailure(error);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changedConnection = await tx.aiProviderConnection.updateMany({
          where: { id: connectionId, tenantId, revision: input.expectedRevision },
          data: {
            modelId: input.modelId,
            healthState: 'ready',
            lastTestErrorCode: null,
            lastTestedAt: this.now(),
            testedRevision: input.expectedRevision + 1,
            capabilitySnapshot: probe.capabilities as Prisma.InputJsonValue,
            revision: { increment: 1 }
          }
        });
        if (changedConnection.count !== 1) throw new RevisionConflict();
        const changedIntegration = await tx.aiIntegration.updateMany({
          where: { id: integration.id, tenantId, revision: input.expectedIntegrationRevision },
          data: {
            activeChatConnectionId: connectionId,
            generationEnabled: true,
            status: 'active',
            revision: { increment: 1 }
          }
        });
        // Throwing rolls back the connection update if the integration changed during the probe.
        if (changedIntegration.count !== 1) throw new RevisionConflict();
        await tx.auditLog.create({
          data: audit(
            tenantId,
            actorUserId,
            'ai.chat.model_applied',
            'AiProviderConnection',
            connectionId,
            input.reason,
            requestId,
            { previousModelId: connection.modelId, modelId: input.modelId }
          )
        });
        const updatedConnection = await tx.aiProviderConnection.findUniqueOrThrow({
          where: { id: connectionId },
          include: connectionInclude
        });
        const updatedIntegration = await tx.aiIntegration.findUniqueOrThrow({
          where: { id: integration.id }
        });
        return {
          status: 'ok' as const,
          value: {
            connection: connectionView(updatedConnection),
            integration: integrationView(updatedIntegration),
            test: probe.test
          }
        };
      });
    } catch (error) {
      if (error instanceof RevisionConflict) return { status: 'revision_conflict' };
      throw error;
    }
  }

  public async activate(
    tenantId: string,
    actorUserId: string,
    input: AiIntegrationActivation,
    requestId: string
  ): Promise<AiMutationResult<AiIntegrationView>> {
    const integration = await this.ensureIntegration(tenantId);
    if (integration.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    const connection = await this.prisma.aiProviderConnection.findFirst({
      where: { id: input.connectionId, tenantId, purpose: input.purpose }
    });
    if (!connection) return { status: 'not_found' };
    if (connection.healthState !== 'ready' || connection.testedRevision !== connection.revision) {
      return { status: 'not_ready' };
    }
    if (input.purpose === 'embedding') {
      const activeIndex = await this.prisma.embeddingIndexVersion.findFirst({
        where: { tenantId, state: 'active' }
      });
      if (
        activeIndex &&
        (activeIndex.modelId !== connection.modelId ||
          activeIndex.dimensions !== connection.dimensions)
      ) {
        return { status: 'reindex_required' };
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiIntegration.updateMany({
        where: { id: integration.id, tenantId, revision: input.expectedRevision },
        data:
          input.purpose === 'chat'
            ? {
                activeChatConnectionId: connection.id,
                generationEnabled: true,
                status: 'active',
                revision: { increment: 1 }
              }
            : {
                activeEmbeddingConnectionId: connection.id,
                status: integration.generationEnabled ? 'active' : 'configured',
                revision: { increment: 1 }
              }
      });
      if (changed.count !== 1) return { status: 'revision_conflict' as const };
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          `ai.${input.purpose}.activated`,
          'AiIntegration',
          integration.id,
          input.reason,
          requestId,
          { connectionId: connection.id, modelId: connection.modelId }
        )
      });
      const updated = await tx.aiIntegration.findUniqueOrThrow({ where: { id: integration.id } });
      return { status: 'ok' as const, value: integrationView(updated) };
    });
  }

  public async deactivate(
    tenantId: string,
    actorUserId: string,
    input: AiIntegrationDeactivate,
    requestId: string
  ): Promise<AiMutationResult<AiIntegrationView>> {
    const integration = await this.ensureIntegration(tenantId);
    if (integration.revision !== input.expectedRevision) return { status: 'revision_conflict' };
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiIntegration.updateMany({
        where: { id: integration.id, tenantId, revision: input.expectedRevision },
        data:
          input.purpose === 'chat'
            ? {
                activeChatConnectionId: null,
                generationEnabled: false,
                status: integration.activeEmbeddingConnectionId ? 'configured' : 'inactive',
                revision: { increment: 1 }
              }
            : {
                activeEmbeddingConnectionId: null,
                retrievalEnabled: false,
                status: integration.generationEnabled ? 'active' : 'inactive',
                revision: { increment: 1 }
              }
      });
      if (changed.count !== 1) return { status: 'revision_conflict' as const };
      await tx.auditLog.create({
        data: audit(
          tenantId,
          actorUserId,
          `ai.${input.purpose}.deactivated`,
          'AiIntegration',
          integration.id,
          input.reason,
          requestId
        )
      });
      const updated = await tx.aiIntegration.findUniqueOrThrow({ where: { id: integration.id } });
      return { status: 'ok' as const, value: integrationView(updated) };
    });
  }
}
