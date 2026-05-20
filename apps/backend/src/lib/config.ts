import { z } from 'zod';

// Treat empty strings in dotenv as "not set" so users can leave optional
// keys present-but-blank without tripping URL/string validators.
const blankToUndefined = (v: unknown) =>
  typeof v === 'string' && v.length === 0 ? undefined : v;
const nonEmpty = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_TENANT_ID: nonEmpty,
  AUTH_AUDIENCE: nonEmpty,
  // Azure Blob storage — required for asset upload/download.
  // Until all three are set, /api/assets routes return 503.
  AZURE_STORAGE_ACCOUNT_NAME: nonEmpty,
  AZURE_STORAGE_ACCOUNT_KEY: nonEmpty,
  AZURE_STORAGE_ACCOUNT_URL: optionalUrl,
  AZURE_STORAGE_CONTAINER: z.string().default('innsyn-assets'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // The Pino logger isn't constructed yet (it depends on config.LOG_LEVEL),
  // so write directly to stderr instead of console.* to stay consistent with
  // the "no console.log" rule.
  process.stderr.write(
    `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}\n`,
  );
  process.exit(1);
}

export const config = parsed.data;

export const authConfigured = Boolean(config.AUTH_TENANT_ID && config.AUTH_AUDIENCE);

export const blobConfigured = Boolean(
  config.AZURE_STORAGE_ACCOUNT_NAME &&
    config.AZURE_STORAGE_ACCOUNT_KEY &&
    config.AZURE_STORAGE_ACCOUNT_URL,
);
