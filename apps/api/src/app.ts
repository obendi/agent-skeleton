import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Store, User } from './store.js';
import { digest, hashPassword, token, verifyPassword } from './security.js';
declare module 'fastify' {
  interface FastifyContextConfig { public?: boolean; role?: 'admin' }
  interface FastifyRequest { user: User | null }
}
export async function buildApp(config: Config, store: Store) {
  const production = config.NODE_ENV === 'production';
  // Trust exactly one proxy only when isolated behind Traefik; never trust the full XFF chain.
  const app = Fastify({ bodyLimit: 16 * 1024, trustProxy: config.TRUST_PROXY_HOPS ? (_address, hop) => hop < config.TRUST_PROXY_HOPS : false, logger: config.NODE_ENV !== 'test' ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] } : false });
  const cookieName = production ? '__Host-session' : 'session';
  const cookieOptions = { path: '/', httpOnly: true, secure: production, sameSite: 'strict' as const };
  const dummyHash = await hashPassword(token());
  app.decorateRequest('user', null);
  await app.register(helmet);
  await app.register(cookie);
  // Origin validation + a mandatory custom header protect unsafe requests from CSRF,
  // including requests from sibling subdomains (SameSite alone does not).
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin !== config.APP_ORIGIN) return reply.code(403).send({ message: 'Origen no permitido' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (origin !== config.APP_ORIGIN || req.headers['x-requested-with'] !== 'webapp')) return reply.code(403).send({ message: 'Petición no permitida' });
  });
  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'X-Requested-With'] });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.addHook('preHandler', async (req, reply) => {
    if (req.routeOptions.config.public) return;
    const raw = req.cookies[cookieName];
    req.user = raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? await store.getSession(digest(raw)) ?? null : null;
    if (!req.user) return reply.code(401).send({ message: 'Inicia sesión para continuar' });
    if (req.routeOptions.config.role && req.user.role !== req.routeOptions.config.role) return reply.code(403).send({ message: 'No tienes permisos' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ message: 'Datos no válidos' });
    const status = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) req.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({ message: status >= 500 ? 'Error interno' : status === 429 ? 'Demasiados intentos. Espera un momento.' : 'Petición no válida' });
  });
  app.get('/health', { config: { public: true } }, async () => ({ status: 'ok' }));
  app.post('/auth/login', { config: { public: true, rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }).strict().parse(req.body);
    const user = await store.findUser(body.email);
    const valid = await verifyPassword(body.password, user?.passwordHash ?? dummyHash);
    if (!valid || !user) return reply.code(401).send({ message: 'Email o contraseña incorrectos' });
    const previous = req.cookies[cookieName];
    if (previous) await store.deleteSession(digest(previous));
    const raw = token();
    await store.createSession({ tokenHash: digest(raw), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) });
    reply.setCookie(cookieName, raw, { ...cookieOptions, maxAge: 8 * 60 * 60 });
    return { user: { id: user.id, email: user.email, role: user.role } };
  });
  app.get('/auth/me', async req => ({ user: { id: req.user!.id, email: req.user!.email, role: req.user!.role } }));
  app.post('/auth/logout', async (req, reply) => {
    await store.deleteSession(digest(req.cookies[cookieName]!));
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });
  app.get('/admin/status', { config: { role: 'admin' } }, async () => ({ status: 'ok' }));
  return app;
}
