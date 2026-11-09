import { pgTable, text, bigint } from "drizzle-orm/pg-core";

const millis = (name: string) => bigint(name, { mode: "number" });
export const connections = pgTable("google_connections", {
  clientId: text("client_id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  customerId: text("customer_id"),
  accountName: text("account_name"),
  currency: text("currency"),
  timeZone: text("time_zone"),
  updatedAt: millis("updated_at").notNull(),
});

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  clientId: text("client_id").notNull(),
  expiresAt: millis("expires_at").notNull(),
});

export const accountBudgets = pgTable("account_budgets", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  customerId: text("customer_id").notNull(),
  month: text("month").notNull(),
  amount: millis("amount").notNull(),
  updatedAt: millis("updated_at").notNull(),
});
export const agencyActivities = pgTable("agency_activities", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  customerId: text("customer_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: millis("created_at").notNull(),
});
export const reportCache = pgTable("report_cache", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  expiresAt: millis("expires_at").notNull(),
});
