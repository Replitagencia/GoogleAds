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
