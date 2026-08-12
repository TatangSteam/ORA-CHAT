export interface DependencyStatus {
  name:
    'database' | 'redis' | 'worker' | 'minio' | 'whatsapp' | 'chat_provider' | 'embedding_provider';
  status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
  latencyMs: number | null;
}
