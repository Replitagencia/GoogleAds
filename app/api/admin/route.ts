import { getPool } from "@/db";
import { requireAdmin, apiError, AccessError } from "@/lib/access";
import { createInvitation, createClientWithAccess } from "@/lib/invitations";
import { sameOrigin, json } from "@/lib/google-ads";
import { randomUUID } from "node:crypto";
export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const [clients, users, invitations, checklist, profiles] =
      await Promise.all([
        getPool().query(
          "SELECT c.id,c.name,c.status,g.customer_id,g.account_name FROM clients c LEFT JOIN google_connections g ON g.client_id=c.id ORDER BY c.name",
        ),
        getPool().query(
          'SELECT u.id,u.name,u.email,p.disabled,array_remove(array_agg(m.client_id),NULL) AS clients FROM "user" u JOIN portal_users p ON p.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id WHERE NOT p.is_admin GROUP BY u.id,p.disabled ORDER BY u.email',
        ),
        getPool().query(
          "SELECT id,email,client_id,expires_at FROM invitations WHERE used_at IS NULL AND expires_at>now() AND NOT is_admin ORDER BY created_at DESC",
        ),
        getPool().query(
          "SELECT client_id,item_key,title,position,completed FROM client_checklist ORDER BY position",
        ),
        getPool().query(
          "SELECT client_id,contact_name,contact_email,contact_phone,responsible,internal_notes FROM client_profiles",
        ),
      ]);
    return json({
      clients: clients.rows,
      users: users.rows,
      invitations: invitations.rows,
      checklist: checklist.rows,
      profiles: profiles.rows,
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
    if (body.action === "checklist-add") {
      if (
        typeof body.clientId !== "string" ||
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 200
      )
        throw new AccessError(
          "Escribe una tarea de hasta 200 caracteres.",
          400,
        );
      const result = await getPool().query(
        "INSERT INTO client_checklist(client_id,item_key,title,position) SELECT id,$2,$3,COALESCE((SELECT MAX(position)+1 FROM client_checklist WHERE client_id=$1),1) FROM clients WHERE id=$1 RETURNING item_key",
        [body.clientId, randomUUID(), body.title.trim()],
      );
      if (!result.rowCount)
        throw new AccessError("Cliente no disponible.", 404);
      return json({ ok: true });
    }
    if (body.action === "save-profile") {
      const fields = [
        "contactName",
        "contactEmail",
        "contactPhone",
        "responsible",
        "internalNotes",
      ] as const;
      if (
        typeof body.clientId !== "string" ||
        fields.some(
          (k) =>
            typeof body[k] !== "string" ||
            body[k].length > (k === "internalNotes" ? 4000 : 254),
        )
      )
        throw new AccessError("Datos de contacto inválidos.", 400);
      if (
        body.contactEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)
      )
        throw new AccessError("Correo de contacto inválido.", 400);
      const result = await getPool().query(
        "INSERT INTO client_profiles(client_id,contact_name,contact_email,contact_phone,responsible,internal_notes) SELECT id,$2,$3,$4,$5,$6 FROM clients WHERE id=$1 ON CONFLICT(client_id) DO UPDATE SET contact_name=EXCLUDED.contact_name,contact_email=EXCLUDED.contact_email,contact_phone=EXCLUDED.contact_phone,responsible=EXCLUDED.responsible,internal_notes=EXCLUDED.internal_notes,updated_at=now() RETURNING client_id",
        [body.clientId, ...fields.map((k) => body[k].trim())],
      );
      if (!result.rowCount)
        throw new AccessError("Cliente no disponible.", 404);
      return json({ ok: true });
    }
    if (body.action === "checklist-status") {
      if (
        typeof body.clientId !== "string" ||
        typeof body.itemKey !== "string" ||
        typeof body.completed !== "boolean"
      )
        throw new AccessError("Datos de checklist inválidos.", 400);
      const result = await getPool().query(
        "UPDATE client_checklist SET completed=$3, updated_at=now() WHERE client_id=$1 AND item_key=$2 RETURNING item_key",
        [body.clientId, body.itemKey, body.completed],
      );
      if (!result.rowCount) throw new AccessError("Tarea no disponible.", 404);
      return json({ ok: true });
    }
    if (body.action === "create-client-access") {
      if (typeof body.name !== "string" || typeof body.email !== "string")
        throw new AccessError("Empresa y correo del cliente requeridos.", 400);
      return json({
        ok: true,
        ...(await createClientWithAccess(body.name, body.email, user.userId)),
      });
    }
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
