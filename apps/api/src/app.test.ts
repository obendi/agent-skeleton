import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { config } from './config.js';
import { digest, hashPassword } from './security.js';
import type { Store, User, Session } from './store.js';
const origin = 'https://app.example.com';
const headers = { origin, 'x-requested-with': 'webapp' };
const password = 'a-long-test-password';
async function fixture(proxyHops = 0) {
  const user: User = { id: '018f0000-0000-4000-8000-000000000001', email: 'user@example.com', passwordHash: await hashPassword(password), role: 'user' };
  const sessions = new Map<string, Session>();
  const store: Store = {
    async findUser(email) { return email === user.email ? user : undefined; },
    async getSession(hash) { const session = sessions.get(hash); return session && session.expiresAt > new Date() ? user : undefined; },
    async createSession(session) { sessions.set(session.tokenHash, session); },
    async deleteSession(hash) { sessions.delete(hash); },
  };
  const app = await buildApp({ NODE_ENV: 'production', TRUST_PROXY_HOPS: proxyHops, PORT: 3000, APP_ORIGIN: origin, DATABASE_URL: 'unused' }, store);
  const login = () => app.inject({ method: 'POST', url: '/auth/login', headers, payload: { email: user.email, password } });
  return { app, user, sessions, login };
}
test('session lifecycle, host-only secure cookie, role enforcement and revocation', async t => {
  const { app, user, sessions, login } = await fixture(); t.after(() => app.close());
  assert.equal((await app.inject('/auth/me')).statusCode, 401);
  const response = await login();
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.passwordHash, undefined);
  const cookie = String(response.headers['set-cookie']);
  assert.match(cookie, /^__Host-session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.doesNotMatch(cookie, /Domain=/i);
  const auth = cookie.split(';')[0];
  assert.equal((await app.inject({ url: '/auth/me', headers: { cookie: auth } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/admin/status', headers: { cookie: auth } })).statusCode, 403);
  user.role = 'admin';
  assert.equal((await app.inject({ url: '/admin/status', headers: { cookie: auth } })).statusCode, 200);
  assert.equal(sessions.has(digest(auth.split('=')[1])), true);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: { ...headers, cookie: auth } })).statusCode, 204);
  assert.equal((await app.inject({ url: '/auth/me', headers: { cookie: auth } })).statusCode, 401);
});
test('rejects CSRF, sibling origins, malformed payloads and incorrect passwords', async t => {
  const { app, user } = await fixture(); t.after(() => app.close());
  for (const badHeaders of [{}, { origin }, { ...headers, origin: 'https://evil.example.com' }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers: badHeaders, payload: { email: user.email, password } })).statusCode, 403);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers, payload: { email: user.email, password, role: 'admin' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers, payload: { email: user.email, password: 'wrong' } })).statusCode, 401);
  const preflight = await app.inject({ method: 'OPTIONS', url: '/auth/login', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-requested-with' } });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  assert.equal((await app.inject({ method: 'OPTIONS', url: '/auth/login', headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' } })).statusCode, 403);
});
test('expired and forged sessions cannot authenticate; login rotates the previous session', async t => {
  const { app, sessions, login } = await fixture(); t.after(() => app.close());
  const first = await login();
  const auth = String(first.headers['set-cookie']).split(';')[0];
  const hash = digest(auth.split('=')[1]);
  sessions.get(hash)!.expiresAt = new Date(0);
  assert.equal((await app.inject({ url: '/auth/me', headers: { cookie: auth } })).statusCode, 401);
  assert.equal((await app.inject({ url: '/auth/me', headers: { cookie: '__Host-session=fake' } })).statusCode, 401);
  const rotated = await app.inject({ method: 'POST', url: '/auth/login', headers: { ...headers, cookie: auth }, payload: { email: 'user@example.com', password } });
  assert.equal(rotated.statusCode, 200);
  assert.equal(sessions.has(hash), false);
});
test('login rate limit cannot be bypassed with forged forwarding headers', async t => {
  const { app } = await fixture(); t.after(() => app.close());
  for (let n = 0; n < 10; n++) {
    const result = await app.inject({ method: 'POST', url: '/auth/login', headers: { ...headers, 'x-forwarded-for': `1.2.3.${n}` }, payload: { email: 'missing@example.com', password } });
    assert.equal(result.statusCode, 401);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers, payload: { email: 'missing@example.com', password } })).statusCode, 429);
});
test('production configuration requires a precise HTTPS origin', () => {
  assert.throws(() => config({ NODE_ENV: 'production', APP_ORIGIN: 'http://app.example.com', DATABASE_URL: 'test' }));
  assert.throws(() => config({ NODE_ENV: 'production', APP_ORIGIN: 'https://app.example.com/path', DATABASE_URL: 'test' }));
});

test('one-hop proxy uses the nearest forwarded address, not an attacker supplied prefix', async t => {
  const { app } = await fixture(1); t.after(() => app.close());
  for (let n = 0; n < 10; n++) {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers: { ...headers, 'x-forwarded-for': `6.6.6.${n}, 203.0.113.1` }, payload: { email: 'missing@example.com', password } })).statusCode, 401);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers: { ...headers, 'x-forwarded-for': '6.6.6.99, 203.0.113.1' }, payload: { email: 'missing@example.com', password } })).statusCode, 429);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', headers: { ...headers, 'x-forwarded-for': '203.0.113.2' }, payload: { email: 'missing@example.com', password } })).statusCode, 401);
});
