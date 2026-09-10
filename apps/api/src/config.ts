import { z } from 'zod';
export function config(env: NodeJS.ProcessEnv = process.env) {
  const value = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    IBKR_GATEWAY_URL: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
    IBKR_ACCOUNT_ID: z.preprocess(v => v === '' ? undefined : v, z.string().regex(/^[A-Za-z0-9]+$/).optional()),
    IBKR_OWNER_USER_ID: z.preprocess(v => v === '' ? undefined : v, z.string().uuid().optional()),
    DATABASE_URL: z.string().min(1),
  }).parse(env);
  const origin = new URL(value.APP_ORIGIN);
  if (origin.origin !== value.APP_ORIGIN || (value.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; HTTPS is required in production');
  if (value.IBKR_GATEWAY_URL) {
    const gateway = new URL(value.IBKR_GATEWAY_URL);
    if (!['http:', 'https:'].includes(gateway.protocol) || gateway.username || gateway.password || gateway.search || gateway.hash) throw new Error('Invalid IBKR_GATEWAY_URL');
  }
  return value;
}
export type Config = ReturnType<typeof config>;
