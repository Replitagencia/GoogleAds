import { getMigrations } from "better-auth/db/migration";
import { readFile } from "node:fs/promises";
import { getAuth } from "../lib/auth";
import { getPool } from "../db";
await (await getMigrations(getAuth().options)).runMigrations();
await getPool().query(
  await readFile(new URL("../db/saas.sql", import.meta.url), "utf8"),
);
console.log("Migraciones de autenticación y clientes aplicadas.");
await getPool().end();
