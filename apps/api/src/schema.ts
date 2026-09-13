import { pgTable, uuid, text, timestamp, index, numeric, integer } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
});
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [index('sessions_expiry_idx').on(table.expiresAt)]);

export const growthSettings = pgTable('growth_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  portfolioEuros: numeric('portfolio_euros', { precision: 16, scale: 2, mode: 'number' }).notNull(),
});
export const growthOrders = pgTable('growth_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ticker: text('ticker').notNull(),
  portfolioEuros: numeric('portfolio_euros', { precision: 16, scale: 2, mode: 'number' }).notNull(),
  percentage: numeric('percentage', { precision: 5, scale: 2, mode: 'number' }).notNull(),
  entryPrice: numeric('entry_price', { precision: 16, scale: 4, mode: 'number' }).notNull(),
  quantity: integer('quantity').notNull(),
  stopLoss: numeric('stop_loss', { precision: 18, scale: 6, mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('growth_orders_user_idx').on(table.userId, table.createdAt)]);
