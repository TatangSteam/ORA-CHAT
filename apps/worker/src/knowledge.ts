import { createHash } from 'node:crypto';

import {
  AiProviderAdapter,
  PinnedSafeHttpTransport,
  type ProviderConnectionRuntime
} from '@raho/ai';
import { aiCapabilitiesSchema, aiProviderSchema, aiPurposeSchema } from '@raho/contracts';
import { generateUuidV7, openCredential, Prisma, type PrismaClient } from '@raho/db';
import {
  getPrivateObject,
  privateObjectKey,
  putPrivateObject,
  type createStorageClient,
  type StorageConfig
} from '@raho/storage';

import { assertSafeDocument, chunkDocumentText, extractDocumentText } from './document-content.js';

type StorageClient = ReturnType<typeof createStorageClient>;

const runtimeFor = (
  connection: {
    id: string;
    tenantId: string;
    purpose: string;
    provider: string;
    baseUrl: string | null;
    modelId: string;
    dimensions: number | null;
    taskType: string | null;
    timeoutMs: number;
    maxRetries: number;
    maxOutputTokens: number;
    generationConfig: unknown;
    capabilitySnapshot: unknown;
    credential: null | {
      encryptedCiphertext: Uint8Array;
      encryptedDataKey: Uint8Array;
      nonce: Uint8Array;
      encryptionAlgorithm: string;
      masterKeyVersion: string;
      revokedAt: Date | null;
    };
  },
  masterKey: Buffer
): ProviderConnectionRuntime => {
  const capabilities = aiCapabilitiesSchema.safeParse(connection.capabilitySnapshot);
  const rawConfig =
    connection.generationConfig && typeof connection.generationConfig === 'object'
      ? (connection.generationConfig as Record<string, unknown>)
      : {};
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
    generationConfig: {
      ...(typeof rawConfig.temperature === 'number' ? { temperature: rawConfig.temperature } : {}),
      ...(typeof rawConfig.topP === 'number' ? { topP: rawConfig.topP } : {})
    },
    ...(capabilities.success ? { capabilitySnapshot: capabilities.data } : {}),
    credential:
      connection.credential && !connection.credential.revokedAt
        ? openCredential(
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
            masterKey
          )
        : null
  };
};

const failureCode = (error: unknown): string => {
  const candidate = error instanceof Error ? error.message : 'PROCESSING_FAILED';
  return /^[A-Z0-9_]{3,80}$/u.test(candidate) ? candidate : 'PROCESSING_FAILED';
};

export class KnowledgeWorker {
  private readonly transport: PinnedSafeHttpTransport;
  private readonly reindexChains = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageClient,
    private readonly storageConfig: StorageConfig,
    private readonly masterKey: Buffer
  ) {
    this.transport = new PinnedSafeHttpTransport({
      privateHostAllowlist: (process.env.AI_PRIVATE_HOST_ALLOWLIST ?? '')
        .split(',')
        .filter(Boolean),
      allowedPrivatePorts: (process.env.AI_PRIVATE_PORT_ALLOWLIST ?? '')
        .split(',')
        .map(Number)
        .filter(Number.isInteger)
    });
  }

  public async processDocument(tenantId: string, documentId: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { storageObjects: true }
    });
    if (!document || document.state === 'archived') return { status: 'noop' as const };
    if (document.state === 'ready') return this.reindex(tenantId);
    const quarantine = document.storageObjects.find(({ role }) => role === 'quarantine');
    const existingSource = document.storageObjects.find(({ role }) => role === 'source');
    if (!quarantine && !existingSource) {
      await this.markFailed(documentId, tenantId, 'SOURCE_OBJECT_MISSING');
      return { status: 'failed' as const, reason: 'SOURCE_OBJECT_MISSING' };
    }
    try {
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { state: 'extracting', failureCode: null, revision: { increment: 1 } }
      });
      const object = quarantine ?? existingSource!;
      const content = await getPrivateObject(
        this.storage,
        object.bucket,
        object.objectKey,
        object.versionId
      );
      const mime = assertSafeDocument(content, document.declaredMime, document.sha256);
      const text = await extractDocumentText(content, mime);
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { state: 'cleaning', detectedMime: mime }
      });

      if (!existingSource) {
        const key = privateObjectKey(tenantId, documentId, 'source');
        const stored = await putPrivateObject(
          this.storage,
          this.storageConfig.buckets.knowledge,
          key,
          content,
          mime,
          document.sha256
        );
        await this.prisma.knowledgeStorageObject.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            documentId,
            role: 'source',
            bucket: this.storageConfig.buckets.knowledge,
            objectKey: key,
            versionId: stored.versionId,
            etag: stored.etag,
            byteSize: content.length,
            sha256: document.sha256,
            verifiedAt: new Date()
          }
        });
      }

      const extracted = Buffer.from(text, 'utf8');
      const extractedHash = createHash('sha256').update(extracted).digest('hex');
      const existingExtracted = document.storageObjects.find(({ role }) => role === 'extracted');
      if (!existingExtracted) {
        const key = privateObjectKey(tenantId, documentId, 'extracted');
        const stored = await putPrivateObject(
          this.storage,
          this.storageConfig.buckets.knowledge,
          key,
          extracted,
          'text/plain; charset=utf-8',
          extractedHash
        );
        await this.prisma.knowledgeStorageObject.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            documentId,
            role: 'extracted',
            bucket: this.storageConfig.buckets.knowledge,
            objectKey: key,
            versionId: stored.versionId,
            etag: stored.etag,
            byteSize: extracted.length,
            sha256: extractedHash,
            verifiedAt: new Date()
          }
        });
      }
      await this.prisma.knowledgeLexicalChunk.createMany({
        data: chunkDocumentText(text).map((chunk) => ({
          id: generateUuidV7(),
          tenantId,
          documentId,
          itemVersionId: null,
          ...chunk
        })),
        skipDuplicates: true
      });
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { state: 'ready', readyAt: new Date(), revision: { increment: 1 } }
      });
      if (quarantine) {
        await this.storage
          .removeObject(quarantine.bucket, quarantine.objectKey)
          .catch(() => undefined);
        await this.prisma.knowledgeStorageObject.delete({ where: { id: quarantine.id } });
      }
      return this.reindex(tenantId);
    } catch (error) {
      const reason = failureCode(error);
      await this.markFailed(documentId, tenantId, reason);
      return { status: 'failed' as const, reason };
    }
  }

  private async markFailed(documentId: string, tenantId: string, code: string) {
    await this.prisma.knowledgeDocument.updateMany({
      where: { id: documentId, tenantId, state: { not: 'archived' } },
      data: { state: 'failed', failureCode: code, revision: { increment: 1 } }
    });
  }

  public async reindex(tenantId: string) {
    const previous = this.reindexChains.get(tenantId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.buildIndex(tenantId));
    this.reindexChains.set(tenantId, current);
    try {
      return await current;
    } finally {
      if (this.reindexChains.get(tenantId) === current) this.reindexChains.delete(tenantId);
    }
  }

  private async buildIndex(tenantId: string) {
    const integration = await this.prisma.aiIntegration.findFirst({
      where: { tenantId, name: 'default' },
      include: { activeEmbeddingConnection: { include: { credential: true } } }
    });
    const connection = integration?.activeEmbeddingConnection;
    if (
      !integration ||
      !connection ||
      connection.healthState !== 'ready' ||
      !connection.dimensions
    ) {
      return { status: 'deferred' as const, reason: 'EMBEDDING_NOT_READY' };
    }
    const [items, documents, latest] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        where: { tenantId, status: 'published', publishedVersionId: { not: null } },
        include: {
          publishedVersion: { include: { questionVariants: true } }
        },
        orderBy: { id: 'asc' }
      }),
      this.prisma.knowledgeDocument.findMany({
        where: { tenantId, state: 'ready' },
        include: { storageObjects: { where: { role: 'extracted' } } },
        orderBy: { id: 'asc' }
      }),
      this.prisma.embeddingIndexVersion.findFirst({
        where: { tenantId },
        orderBy: { version: 'desc' },
        select: { version: true }
      })
    ]);
    const sources: Array<{
      documentId: string | null;
      itemVersionId: string | null;
      text: string;
    }> = [];
    for (const item of items) {
      if (!item.publishedVersion) continue;
      const questions = item.publishedVersion.questionVariants
        .map(({ question }) => question)
        .join('\n');
      sources.push({
        documentId: null,
        itemVersionId: item.publishedVersion.id,
        text: `${item.title}\n${questions}\n${item.publishedVersion.answer}`
      });
    }
    for (const document of documents) {
      const extracted = document.storageObjects[0];
      if (!extracted) continue;
      sources.push({
        documentId: document.id,
        itemVersionId: null,
        text: (
          await getPrivateObject(
            this.storage,
            extracted.bucket,
            extracted.objectKey,
            extracted.versionId
          )
        ).toString('utf8')
      });
    }
    const chunks = sources.flatMap((source) =>
      chunkDocumentText(source.text).map((chunk) => ({ ...source, ...chunk }))
    );
    if (chunks.length === 0) return { status: 'deferred' as const, reason: 'NO_PUBLISHED_SOURCE' };
    const indexId = generateUuidV7();
    await this.prisma.embeddingIndexVersion.create({
      data: {
        id: indexId,
        tenantId,
        providerConnectionId: connection.id,
        version: (latest?.version ?? 0) + 1,
        modelId: connection.modelId,
        dimensions: connection.dimensions,
        totalChunks: chunks.length
      }
    });
    const adapter = new AiProviderAdapter(runtimeFor(connection, this.masterKey), this.transport);
    try {
      for (const chunk of chunks) {
        const embedded = await adapter.embedQuery(chunk.content);
        if (embedded.vector.length !== connection.dimensions) throw new Error('DIMENSION_MISMATCH');
        const vector = `[${embedded.vector.join(',')}]`;
        await this.prisma.$executeRaw(Prisma.sql`
          INSERT INTO knowledge_chunks
            (id, tenant_id, index_version_id, document_id, item_version_id, sequence,
             content, content_hash, token_estimate, embedding, created_at)
          VALUES
            (${generateUuidV7()}::uuid, ${tenantId}::uuid, ${indexId}::uuid,
             ${chunk.documentId}::uuid, ${chunk.itemVersionId}::uuid, ${chunk.sequence},
             ${chunk.content}, ${chunk.contentHash}, ${chunk.tokenEstimate}, ${vector}::vector, CURRENT_TIMESTAMP)
        `);
        await this.prisma.embeddingIndexVersion.update({
          where: { id: indexId },
          data: { embeddedChunks: { increment: 1 } }
        });
      }
      await this.prisma.$transaction(async (tx) => {
        const built = await tx.embeddingIndexVersion.findUniqueOrThrow({ where: { id: indexId } });
        if (
          built.embeddedChunks !== built.totalChunks ||
          built.dimensions !== connection.dimensions
        ) {
          throw new Error('INDEX_INCOMPLETE');
        }
        await tx.embeddingIndexVersion.updateMany({
          where: { tenantId, state: 'active' },
          data: { state: 'retired', retiredAt: new Date() }
        });
        await tx.embeddingIndexVersion.update({
          where: { id: indexId },
          data: { state: 'active', activatedAt: new Date() }
        });
        await tx.aiIntegration.update({
          where: { id: integration.id },
          data: {
            activeEmbeddingIndexVersionId: indexId,
            retrievalEnabled: true,
            status: integration.generationEnabled ? 'active' : 'configured',
            revision: { increment: 1 }
          }
        });
        await tx.aiResponseCache.deleteMany({ where: { tenantId } });
        await tx.aiEmbeddingUsageLog.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            connectionId: connection.id,
            operation: 'index_build',
            itemCount: chunks.length
          }
        });
      });
      return { status: 'indexed' as const, indexId, chunks: chunks.length };
    } catch (error) {
      await this.prisma.embeddingIndexVersion.update({
        where: { id: indexId },
        data: { state: 'failed' }
      });
      throw error;
    }
  }

  public async sweepOrphans() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const stale = await this.prisma.knowledgeDocument.findMany({
      where: {
        state: { in: ['uploaded', 'queued', 'extracting', 'cleaning', 'chunking', 'embedding'] },
        updatedAt: { lt: cutoff }
      },
      select: { id: true, tenantId: true }
    });
    for (const document of stale) {
      await this.markFailed(document.id, document.tenantId, 'ORPHANED_PIPELINE');
    }
    return stale.length;
  }
}
