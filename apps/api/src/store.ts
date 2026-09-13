import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, gt, lte, desc } from 'drizzle-orm';
import { users, sessions, growthSettings, growthOrders } from './schema.js';
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferInsert;
export type GrowthOrder = typeof growthOrders.$inferSelect;
export interface Store {
  getGrowthSettings(userId: string): Promise<{ portfolioEuros: number } | undefined>;
  saveGrowthSettings(userId: string, portfolioEuros: number): Promise<void>;
  listGrowthOrders(userId: string): Promise<GrowthOrder[]>;
  createGrowthOrder(order: typeof growthOrders.$inferInsert): Promise<GrowthOrder>;

  findUser(email: string): Promise<User | undefined>;
  getSession(hash: string): Promise<User | undefined>;
  createSession(session: Session): Promise<void>;
  deleteSession(hash: string): Promise<void>;
}
export function createStore(url: string) {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql);
  const store: Store = {
    async getGrowthSettings(userId) { return (await db.select({ portfolioEuros: growthSettings.portfolioEuros }).from(growthSettings).where(eq(growthSettings.userId, userId)))[0]; },
    async saveGrowthSettings(userId, portfolioEuros) { await db.insert(growthSettings).values({ userId, portfolioEuros }).onConflictDoUpdate({ target: growthSettings.userId, set: { portfolioEuros } }); },
    async listGrowthOrders(userId) { return db.select().from(growthOrders).where(eq(growthOrders.userId, userId)).orderBy(desc(growthOrders.createdAt)); },
    async createGrowthOrder(order) { return (await db.insert(growthOrders).values(order).returning())[0]; },
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
