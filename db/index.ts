import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
const shared = globalThis as typeof globalThis & { portalPool?: Pool };
export function getPool() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL no está configurada.");
  return (shared.portalPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
}
export function getDb() {
  return drizzle(getPool(), { schema });
}
