import { z } from 'zod';
export function config(env: NodeJS.ProcessEnv = process.env) {
  const value = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
  }).parse(env);
  const origin = new URL(value.APP_ORIGIN);
  if (origin.origin !== value.APP_ORIGIN || (value.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; HTTPS is required in production');
  return value;
}
export type Config = ReturnType<typeof config>;
