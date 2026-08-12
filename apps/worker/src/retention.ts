export const REVOKED_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_KEY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface SessionRetentionRepository {
  deleteRetainedSessions(cutoff: Date): Promise<number>;
}

export interface IdempotencyRetentionRepository {
  deleteExpiredIdempotencyKeys(now: Date): Promise<number>;
}

export const purgeRetainedSessions = async (
  repository: SessionRetentionRepository,
  now: Date
): Promise<{ cutoff: Date; deleted: number }> => {
  const cutoff = new Date(now.getTime() - REVOKED_SESSION_RETENTION_MS);
  const deleted = await repository.deleteRetainedSessions(cutoff);
  return { cutoff, deleted };
};

export const purgeExpiredIdempotencyKeys = async (
  repository: IdempotencyRetentionRepository,
  now: Date
): Promise<{ cutoff: Date; deleted: number }> => {
  const deleted = await repository.deleteExpiredIdempotencyKeys(now);
  return { cutoff: now, deleted };
};
