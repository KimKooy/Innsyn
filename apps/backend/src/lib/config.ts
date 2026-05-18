import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_TENANT_ID: z.string().optional(),
  AUTH_AUDIENCE: z.string().optional(),
  // Azure Blob storage — required for asset upload/download.
  // Until all three are set, /api/assets routes return 503.
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_URL: z.string().url().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('innsyn-assets'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const authConfigured = Boolean(config.AUTH_TENANT_ID && config.AUTH_AUDIENCE);

export const blobConfigured = Boolean(
  config.AZURE_STORAGE_ACCOUNT_NAME &&
    config.AZURE_STORAGE_ACCOUNT_KEY &&
    config.AZURE_STORAGE_ACCOUNT_URL,
);
