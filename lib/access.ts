import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getPool } from "../db";
import { AccessError } from "./errors";
import { portalForHeaders, roleMatchesPortal } from "./portals";
export { AccessError } from "./errors";
export type PortalUser = {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
};
export async function getPortalUser(
  input?: Headers,
): Promise<PortalUser | null> {
  const requestHeaders = input || (await headers());
  const portal = portalForHeaders(requestHeaders);
  if (!portal) return null;
  const session = await getAuth(portal).api.getSession({
    headers: requestHeaders,
  });
  if (!session) return null;
  const { rows } = await getPool().query(
    "SELECT is_admin,disabled,EXISTS (SELECT 1 FROM memberships m JOIN clients c ON c.id=m.client_id WHERE m.user_id=portal_users.user_id AND c.status='active') AS has_client_access FROM portal_users WHERE user_id=$1",
    [session.user.id],
  );
  if (
    !rows[0] ||
    rows[0].disabled ||
    !roleMatchesPortal(portal, rows[0].is_admin, rows[0].has_client_access)
  )
    return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isAdmin: portal.audience === "client" ? false : rows[0].is_admin,
  };
}
export async function requireUser(input?: Headers) {
  const user = await getPortalUser(input);
  if (!user) throw new AccessError("Inicia sesión para continuar.", 401);
  return user;
}
export async function requireAdmin(input?: Headers) {
  const user = await requireUser(input);
  if (!user.isAdmin)
    throw new AccessError("Esta acción requiere acceso de administrador.", 403);
  return user;
}
export async function availableClients(user: PortalUser) {
  const { rows } = await getPool().query(
    user.isAdmin
      ? "SELECT id,name,status FROM clients ORDER BY name"
      : "SELECT c.id,c.name,c.status FROM clients c JOIN memberships m ON m.client_id=c.id WHERE m.user_id=$1 AND c.status='active' ORDER BY c.name",
    user.isAdmin ? [] : [user.userId],
  );
  return rows as { id: string; name: string; status: string }[];
}
export async function clientAccess(user: PortalUser, clientId: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(clientId))
    throw new AccessError("Cliente no disponible.", 404);
  const { rows } = await getPool().query(
    "SELECT c.id,c.name,c.status FROM clients c WHERE c.id=$1 AND c.status='active' AND ($2::boolean OR EXISTS (SELECT 1 FROM memberships m WHERE m.client_id=c.id AND m.user_id=$3))",
    [clientId, user.isAdmin, user.userId],
  );
  if (!rows[0]) throw new AccessError("Cliente no disponible.", 404);
  return rows[0] as { id: string; name: string; status: string };
}
export async function requireClient(request: Request, adminOnly = false) {
  const user = adminOnly
    ? await requireAdmin(request.headers)
    : await requireUser(request.headers);
  const clientId = new URL(request.url).searchParams.get("clientId") || "";
  const client = await clientAccess(user, clientId);
  return { user, clientId: client.id, client };
}
export function apiError(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof AccessError
          ? e.message
          : "No se pudo completar la solicitud.",
    },
    {
      status: e instanceof AccessError ? e.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
