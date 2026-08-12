import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { Client } from 'minio';

export interface StorageConfig {
  endpoint: URL;
  accessKey: string;
  secretKey: string;
  region: string;
  buckets: {
    quarantine: string;
    knowledge: string;
    exports: string;
  };
}

const readRequiredSecret = (variable: string): string => {
  const path = process.env[`${variable}_FILE`];
  if (!path) throw new Error(`${variable}_FILE is required`);
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${variable}_FILE must not be empty`);
  return value;
};

export const readStorageConfig = (): StorageConfig => {
  const endpoint = new URL(process.env.MINIO_ENDPOINT ?? 'http://minio:9000');
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('MINIO_ENDPOINT must use http or https');
  }
  return {
    endpoint,
    accessKey: readRequiredSecret('MINIO_ACCESS_KEY'),
    secretKey: readRequiredSecret('MINIO_SECRET_KEY'),
    region: process.env.MINIO_REGION ?? 'us-east-1',
    buckets: {
      quarantine: process.env.MINIO_BUCKET_QUARANTINE ?? 'raho-quarantine',
      knowledge: process.env.MINIO_BUCKET_KNOWLEDGE ?? 'raho-knowledge',
      exports: process.env.MINIO_BUCKET_EXPORTS ?? 'raho-exports'
    }
  };
};

export const createStorageClient = (config = readStorageConfig()): Client => {
  const client = new Client({
    endPoint: config.endpoint.hostname,
    port: Number(config.endpoint.port || (config.endpoint.protocol === 'https:' ? 443 : 80)),
    useSSL: config.endpoint.protocol === 'https:',
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region,
    pathStyle: true
  });
  client.setAppInfo('raho-whatsapp-chatbot-v2', '0.0.0');
  return client;
};

export const probeStorageBuckets = async (
  client: Client,
  buckets: StorageConfig['buckets']
): Promise<void> => {
  await Promise.all(
    Object.values(buckets).map(async (bucket) => {
      if (!(await client.bucketExists(bucket))) throw new Error(`Required bucket is unavailable`);
    })
  );
};

export const privateObjectKey = (
  tenantId: string,
  documentId: string,
  role: 'quarantine' | 'source' | 'extracted' | 'export'
): string => `${tenantId}/${documentId}/${role}/${randomUUID()}`;

export const readObjectBuffer = async (stream: Readable, limit = 10_485_760): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.length;
    if (size > limit) {
      stream.destroy();
      throw new Error('OBJECT_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const getPrivateObject = async (
  client: Client,
  bucket: string,
  objectKey: string,
  versionId?: string
): Promise<Buffer> =>
  readObjectBuffer(
    await client.getObject(
      bucket,
      objectKey,
      versionId && versionId !== 'unversioned' ? { versionId } : undefined
    )
  );

export const putPrivateObject = async (
  client: Client,
  bucket: string,
  objectKey: string,
  content: Buffer,
  contentType: string,
  sha256: string
): Promise<{ etag: string; versionId: string }> => {
  const result = await client.putObject(bucket, objectKey, content, content.length, {
    'Content-Type': contentType,
    'X-Amz-Meta-Sha256': sha256
  });
  return { etag: result.etag, versionId: result.versionId ?? 'unversioned' };
};
