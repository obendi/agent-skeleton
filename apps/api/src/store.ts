import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, gt, lte } from 'drizzle-orm';
import { users, sessions } from './schema.js';
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferInsert;
export interface Store {
  findUser(email: string): Promise<User | undefined>;
  getSession(hash: string): Promise<User | undefined>;
  createSession(session: Session): Promise<void>;
  deleteSession(hash: string): Promise<void>;
}
export function createStore(url: string) {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql);
  const store: Store = {
    async findUser(email) { return (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]; },
    async getSession(hash) {
      const result = await db.select({ user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date()))).limit(1);
      return result[0]?.user;
    },
    async createSession(session) { await db.insert(sessions).values(session); },
    async deleteSession(hash) { await db.delete(sessions).where(eq(sessions.tokenHash, hash)); },
  };
  return { store, db, close: () => sql.end(), cleanup: () => db.delete(sessions).where(lte(sessions.expiresAt, new Date())) };
}
