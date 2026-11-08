import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const connections = sqliteTable("google_connections", {
  userId: text("user_id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  customerId: text("customer_id"),
  accountName: text("account_name"),
  currency: text("currency"),
  timeZone: text("time_zone"),
  updatedAt: integer("updated_at").notNull(),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const accountBudgets = sqliteTable("account_budgets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  customerId: text("customer_id").notNull(),
  month: text("month").notNull(),
  amount: integer("amount").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const agencyActivities = sqliteTable("agency_activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  customerId: text("customer_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const reportCache = sqliteTable("report_cache", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
