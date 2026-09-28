'use client';

import type { ErrorEnvelope, RequestMeta } from '@raho/contracts';

let csrfToken: string | null = null;
let lastUserActivityAt = Number.NEGATIVE_INFINITY;
const USER_ACTIVITY_WINDOW_MS = 30_000;

export interface ApiEnvelope<T> {
  data: T;
  meta: RequestMeta;
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};

export const markUserActivity = (): void => {
  lastUserActivityAt = Date.now();
};

const hasRecentUserActivity = (): boolean =>
  Date.now() - lastUserActivityAt <= USER_ACTIVITY_WINDOW_MS;

export const api = async <T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> => {
  const method = init.method?.toUpperCase() ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (hasRecentUserActivity()) headers.set('x-session-activity', '1');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }
  const response = await fetch(`/api/admin/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const body = (await response.json()) as ApiEnvelope<T> | ErrorEnvelope;
  if (!response.ok || 'error' in body) {
    const error = 'error' in body ? body.error : { code: 'HTTP_ERROR', message: 'Request gagal.' };
    throw new ApiError(response.status, error.code, error.message);
  }
  return body;
};

export const uploadDocument = async <T>(file: File): Promise<ApiEnvelope<T>> => {
  const headers = new Headers({
    'content-type': file.type,
    'x-file-name': file.name
  });
  if (hasRecentUserActivity()) headers.set('x-session-activity', '1');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch('/api/admin/v1/ai/documents', {
    method: 'POST',
    headers,
    body: file,
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const body = (await response.json()) as ApiEnvelope<T> | ErrorEnvelope;
  if (!response.ok || 'error' in body) {
    const error = 'error' in body ? body.error : { code: 'HTTP_ERROR', message: 'Upload gagal.' };
    throw new ApiError(response.status, error.code, error.message);
  }
  return body;
};
