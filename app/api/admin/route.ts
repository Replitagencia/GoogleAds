import { getPool } from "@/db";
import { requireAdmin, apiError, AccessError } from "@/lib/access";
import { createInvitation } from "@/lib/invitations";
import { sameOrigin, json } from "@/lib/google-ads";
import { randomUUID } from "node:crypto";
export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const [clients, users, invitations] = await Promise.all([
      getPool().query(
        "SELECT c.id,c.name,c.status,g.customer_id,g.account_name FROM clients c LEFT JOIN google_connections g ON g.client_id=c.id ORDER BY c.name",
      ),
      getPool().query(
        'SELECT u.id,u.name,u.email,p.disabled,array_remove(array_agg(m.client_id),NULL) AS clients FROM "user" u JOIN portal_users p ON p.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id WHERE NOT p.is_admin GROUP BY u.id,p.disabled ORDER BY u.email',
      ),
      getPool().query(
        "SELECT id,email,client_id,expires_at FROM invitations WHERE used_at IS NULL AND expires_at>now() AND NOT is_admin ORDER BY created_at DESC",
      ),
    ]);
    return json({
      clients: clients.rows,
      users: users.rows,
      invitations: invitations.rows,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request.headers);
    if (!sameOrigin(request))
      throw new AccessError("Origen no permitido.", 403);
    const body = await request.json();
    if (body.action === "create-client") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 100
      )
        throw new AccessError("Nombre inválido.", 400);
      const id = randomUUID();
      await getPool().query("INSERT INTO clients(id,name) VALUES($1,$2)", [
        id,
        body.name.trim(),
      ]);
      return json({ ok: true, id });
    }
    if (body.action === "invite") {
      if (typeof body.email !== "string" || typeof body.clientId !== "string")
        throw new AccessError("Correo y cliente requeridos.", 400);
      return json({
        url: await createInvitation(body.email, body.clientId, user.userId),
      });
    }
    if (body.action === "revoke-invitation") {
      await getPool().query(
        "UPDATE invitations SET used_at=now() WHERE id=$1 AND NOT is_admin",
        [String(body.id)],
      );
      return json({ ok: true });
    }
    if (
      body.action === "client-status" &&
      ["active", "suspended"].includes(body.status)
    ) {
      await getPool().query("UPDATE clients SET status=$2 WHERE id=$1", [
        String(body.clientId),
        body.status,
      ]);
      return json({ ok: true });
    }
    if (body.action === "user-status" && typeof body.disabled === "boolean") {
      const db = await getPool().connect();
      try {
        await db.query("BEGIN");
        const r = await db.query(
          "UPDATE portal_users SET disabled=$2 WHERE user_id=$1 AND NOT is_admin RETURNING user_id",
          [String(body.userId), body.disabled],
        );
        if (!r.rowCount) throw new AccessError("Usuario no disponible.", 404);
        await db.query('DELETE FROM session WHERE "userId"=$1', [body.userId]);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return json({ ok: true });
    }
    throw new AccessError("Acción inválida.", 400);
  } catch (e) {
    return apiError(e);
  }
}
