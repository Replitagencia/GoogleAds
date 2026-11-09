import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getPool } from "../db";
import type { PortalUser } from "./access";
import { AccessError } from "./errors";
import type { PoolClient } from "pg";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
async function issueInvitation(
  db: PoolClient,
  email: string,
  clientId: string | null,
  actorId: string | null,
  bootstrap = false,
) {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new AccessError("Correo inválido.", 400);
  const token = randomBytes(32).toString("hex");
  if (bootstrap) {
    await db.query("SELECT pg_advisory_xact_lock(983541)");
    const r = await db.query("SELECT 1 FROM portal_users WHERE is_admin=true");
    if (r.rowCount) throw new AccessError("El administrador ya existe.", 409);
  }
  if (clientId) {
    const c = await db.query(
      "SELECT 1 FROM clients WHERE id=$1 AND status='active'",
      [clientId],
    );
    if (!c.rowCount) throw new AccessError("Cliente no disponible.", 404);
    const existing = await db.query(
      'SELECT p.is_admin, EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.client_id=$2) AS assigned FROM "user" u JOIN portal_users p ON p.user_id=u.id WHERE lower(u.email)=$1',
      [email, clientId],
    );
    if (existing.rows[0]?.is_admin)
      throw new AccessError(
        "Este correo es de un administrador. Usa el correo del cliente.",
        409,
      );
    if (existing.rows[0]?.assigned)
      throw new AccessError("Este correo ya tiene acceso a esta empresa.", 409);
  }
  await db.query(
    "UPDATE invitations SET used_at=now() WHERE email=$1 AND client_id IS NOT DISTINCT FROM $2 AND used_at IS NULL",
    [email, clientId],
  );
  await db.query(
    "INSERT INTO invitations(id,token_hash,email,client_id,is_admin,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours',$6)",
    [randomUUID(), tokenHash(token), email, clientId, bootstrap, actorId],
  );
  await db.query(
    "INSERT INTO audit_log(actor_id,action,client_id) VALUES($1,'invitation.created',$2)",
    [actorId, clientId],
  );
  return `${process.env.SITE_URL}/activate?token=${token}`;
}
async function invitationTransaction<T>(
  operation: (db: PoolClient) => Promise<T>,
) {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const result = await operation(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export function createInvitation(
  email: string,
  clientId: string | null,
  actorId: string | null,
  bootstrap = false,
) {
  return invitationTransaction((db) =>
    issueInvitation(db, email, clientId, actorId, bootstrap),
  );
}
export function createClientWithAccess(
  name: string,
  email: string,
  actorId: string,
) {
  if (!name.trim() || name.length > 100)
    throw new AccessError("Nombre de empresa inválido.", 400);
  return invitationTransaction(async (db) => {
    const id = randomUUID();
    await db.query("INSERT INTO clients(id,name) VALUES($1,$2)", [
      id,
      name.trim(),
    ]);
    const url = await issueInvitation(db, email, id, actorId);
    await db.query(
      "INSERT INTO audit_log(actor_id,action,client_id) VALUES($1,'client.created',$2)",
      [actorId, id],
    );
    return { id, url };
  });
}
export async function invitationInfo(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AccessError("Invitación no válida o vencida.", 410);
  const { rows } = await getPool().query(
    "SELECT i.email,i.is_admin,c.name FROM invitations i LEFT JOIN clients c ON c.id=i.client_id WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND (i.is_admin OR c.status='active')",
    [tokenHash(token)],
  );
  if (!rows[0]) throw new AccessError("Invitación no válida o vencida.", 410);
  const exists = await getPool().query(
    'SELECT 1 FROM "user" WHERE lower(email)=$1',
    [rows[0].email],
  );
  return {
    email: rows[0].email,
    clientName: rows[0].name || "Administración de AgenciaLabs",
    existingUser: !!exists.rowCount,
  };
}
export async function acceptInvitation(
  token: string,
  name: string,
  password: string,
  current: PortalUser | null,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AccessError("Invitación no válida.", 410);
  // Hash only after validating an active token; random requests cannot trigger expensive password work.
  const info = await invitationInfo(token);
  if (
    !info.existingUser &&
    (!name.trim() ||
      name.length > 100 ||
      password.length < 12 ||
      password.length > 128)
  )
    throw new AccessError(
      "Ingresa tu nombre y una contraseña de 12 a 128 caracteres.",
      400,
    );
  if (
    info.existingUser &&
    (!current || current.email.toLowerCase() !== info.email)
  )
    throw new AccessError(
      "Inicia sesión con el correo de la invitación para aceptarla.",
      401,
    );
  const hash = info.existingUser ? null : await hashPassword(password);
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
        "SELECT * FROM invitations WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash(token)],
      ),
      invite = rows[0];
    if (!invite) throw new AccessError("Invitación no válida o vencida.", 410);
    if (invite.is_admin) {
      await db.query("SELECT pg_advisory_xact_lock(983541)");
      if (
        (await db.query("SELECT 1 FROM portal_users WHERE is_admin=true"))
          .rowCount
      )
        throw new AccessError("El administrador ya existe.", 409);
    }
    if (
      invite.client_id &&
      !(
        await db.query(
          "SELECT 1 FROM clients WHERE id=$1 AND status='active'",
          [invite.client_id],
        )
      ).rowCount
    )
      throw new AccessError("Cliente no disponible.", 404);
    const existing = (
      await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [
        invite.email,
      ])
    ).rows[0];
    let userId = existing?.id;
    if (existing) {
      if (!current || current.userId !== existing.id)
        throw new AccessError(
          "Inicia sesión con el correo de la invitación.",
          401,
        );
    } else {
      if (!hash) throw new AccessError("Recarga la invitación.", 409);
      userId = randomUUID();
      await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [userId, name.trim(), invite.email],
      );
      await db.query(
        'INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',
        [randomUUID(), userId, hash],
      );
      await db.query(
        "INSERT INTO portal_users(user_id,is_admin) VALUES($1,$2)",
        [userId, invite.is_admin],
      );
    }
    if (invite.client_id)
      await db.query(
        "INSERT INTO memberships(user_id,client_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [userId, invite.client_id],
      );
    await db.query("UPDATE invitations SET used_at=now() WHERE id=$1", [
      invite.id,
    ]);
    await db.query(
      "INSERT INTO audit_log(actor_id,action,client_id) VALUES($1,'invitation.accepted',$2)",
      [userId, invite.client_id],
    );
    await db.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
