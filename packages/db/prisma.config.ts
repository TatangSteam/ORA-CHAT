import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

const readPassword = (): string => {
  const configuredPath = process.env.POSTGRES_PASSWORD_FILE;
  const passwordPath = configuredPath ?? resolve(process.cwd(), '../../.secrets/postgres_password');
  return existsSync(passwordPath)
    ? readFileSync(passwordPath, 'utf8').trim()
    : 'build-only-placeholder';
};

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${encodeURIComponent(process.env.POSTGRES_USER ?? 'raho_app')}:${encodeURIComponent(readPassword())}@${process.env.POSTGRES_HOST ?? 'postgres'}:${process.env.POSTGRES_PORT ?? '5432'}/${encodeURIComponent(process.env.POSTGRES_DB ?? 'raho_chatbot')}?schema=public`;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: databaseUrl
  }
});
