import { getPool } from "@/db";
import { requireUser, clientAccess, AccessError, apiError } from "@/lib/access";
import { json, sameOrigin } from "@/lib/google-ads";
import { randomUUID } from "node:crypto";
const statuses = ["new", "in_progress", "waiting_client", "resolved", "closed"];
async function ticketForUser(
  user: Awaited<ReturnType<typeof requireUser>>,
  id: string,
) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new AccessError("Solicitud no disponible.", 404);
  const result = await getPool().query(
    "SELECT id,client_id,status FROM tickets WHERE id=$1",
    [id],
  );
  if (!result.rows[0]) throw new AccessError("Solicitud no disponible.", 404);
  await clientAccess(user, result.rows[0].client_id);
  return result.rows[0];
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const url = new URL(request.url),
      clientId = url.searchParams.get("clientId"),
      ticketId = url.searchParams.get("ticketId");
    if (ticketId) {
      const ticket = await ticketForUser(user, ticketId);
      const messages = await getPool().query(
        'SELECT * FROM (SELECT m.id,m.body,m.created_at,u.name AS author_name FROM ticket_messages m JOIN "user" u ON u.id=m.author_id WHERE m.ticket_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 500) recent ORDER BY created_at,id',
        [ticket.id],
      );
      return json({ messages: messages.rows });
    }
    if (clientId) await clientAccess(user, clientId);
    else if (!user.isAdmin)
      throw new AccessError("Selecciona un cliente.", 403);
    const tickets = await getPool().query(
      'SELECT t.id,t.client_id,t.subject,t.status,t.created_at,t.updated_at,t.assigned_to,c.name AS client_name,u.name AS author_name,a.name AS assignee_name FROM tickets t JOIN clients c ON c.id=t.client_id JOIN "user" u ON u.id=t.created_by LEFT JOIN "user" a ON a.id=t.assigned_to WHERE ($1::text IS NULL OR t.client_id=$1) AND c.status=\'active\' ORDER BY t.updated_at DESC LIMIT 200',
      [clientId],
    );
    let agents: { id: string; name: string; email: string }[] = [];
    if (user.isAdmin)
      agents = (
        await getPool().query(
          'SELECT u.id,u.name,u.email FROM "user" u JOIN portal_users p ON p.user_id=u.id WHERE p.is_admin AND NOT p.disabled ORDER BY u.name',
        )
      ).rows;
    return json({ tickets: tickets.rows, agents });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    if (!sameOrigin(request))
      throw new AccessError("Origen no permitido.", 403);
    const body = await request.json();
    if (body.action === "create") {
      if (
        typeof body.clientId !== "string" ||
        typeof body.subject !== "string" ||
        !body.subject.trim() ||
        body.subject.length > 120 ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 4000
      )
        throw new AccessError(
          "Ingresa un asunto y una descripción válidos.",
          400,
        );
      const client = await clientAccess(user, body.clientId),
        id = randomUUID(),
        db = await getPool().connect();
      try {
        await db.query("BEGIN");
        await db.query(
          "INSERT INTO tickets(id,client_id,subject,created_by) VALUES($1,$2,$3,$4)",
          [id, client.id, body.subject.trim(), user.userId],
        );
        await db.query(
          "INSERT INTO ticket_messages(id,ticket_id,author_id,body) VALUES($1,$2,$3,$4)",
          [randomUUID(), id, user.userId, body.message.trim()],
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return json({ ok: true, id });
    }
    if (typeof body.ticketId !== "string")
      throw new AccessError("Solicitud no disponible.", 404);
    const ticket = await ticketForUser(user, body.ticketId);
    if (body.action === "reply") {
      if (
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 4000
      )
        throw new AccessError(
          "Escribe un mensaje de hasta 4.000 caracteres.",
          400,
        );
      if (ticket.status === "closed")
        throw new AccessError("La solicitud está cerrada.", 409);
      const db = await getPool().connect();
      try {
        await db.query("BEGIN");
        const locked = await db.query(
          "SELECT status FROM tickets WHERE id=$1 FOR UPDATE",
          [ticket.id],
        );
        if (locked.rows[0]?.status === "closed")
          throw new AccessError("La solicitud está cerrada.", 409);
        await db.query(
          "INSERT INTO ticket_messages(id,ticket_id,author_id,body) VALUES($1,$2,$3,$4)",
          [randomUUID(), ticket.id, user.userId, body.message.trim()],
        );
        await db.query("UPDATE tickets SET updated_at=now() WHERE id=$1", [
          ticket.id,
        ]);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return json({ ok: true });
    }
    if (!user.isAdmin)
      throw new AccessError(
        "Solo la agencia puede gestionar solicitudes.",
        403,
      );
    if (body.action === "status" && statuses.includes(body.status)) {
      await getPool().query(
        "UPDATE tickets SET status=$2,updated_at=now() WHERE id=$1",
        [ticket.id, body.status],
      );
      return json({ ok: true });
    }
    if (
      body.action === "assign" &&
      (typeof body.userId === "string" || body.userId === null)
    ) {
      if (
        body.userId &&
        !(
          await getPool().query(
            "SELECT 1 FROM portal_users WHERE user_id=$1 AND is_admin AND NOT disabled",
            [body.userId],
          )
        ).rowCount
      )
        throw new AccessError("Responsable no disponible.", 400);
      await getPool().query(
        "UPDATE tickets SET assigned_to=$2,updated_at=now() WHERE id=$1",
        [ticket.id, body.userId || null],
      );
      return json({ ok: true });
    }
    throw new AccessError("Acción inválida.", 400);
  } catch (e) {
    return apiError(e);
  }
}
