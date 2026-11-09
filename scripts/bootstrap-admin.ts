import { writeFile } from "node:fs/promises";
import { createInvitation } from "../lib/invitations";
import { getPool } from "../db";
const [email, file] = process.argv.slice(2);
if (!email || !file)
  throw new Error(
    "Uso: npm run admin:invite -- correo archivo-privado-de-salida",
  );
const url = await createInvitation(email, null, null, true);
await writeFile(file, url + "\n", { mode: 0o600, flag: "wx" });
console.log(
  "Invitación de administrador guardada en el archivo privado indicado. Vence en 48 horas.",
);
await getPool().end();
