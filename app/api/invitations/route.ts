import { invitationInfo, acceptInvitation } from "@/lib/invitations";
import { getPortalUser, apiError, AccessError } from "@/lib/access";
import { sameOrigin, json } from "@/lib/google-ads";
import { portalForHeaders, roleMatchesPortal } from "@/lib/portals";
async function infoForPortal(request: Request, token: string) {
  const portal = portalForHeaders(request.headers);
  if (!portal) throw new AccessError("Portal no permitido.", 400);
  const info = await invitationInfo(token);
  if (!roleMatchesPortal(portal, info.isAdmin))
    throw new AccessError(
      "Abre el enlace de activación en el portal indicado en tu invitación.",
      403,
    );
  return info;
}
export async function GET(request: Request) {
  try {
    return json(
      await infoForPortal(
        request,
        new URL(request.url).searchParams.get("token") || "",
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      throw new AccessError("Origen no permitido.", 403);
    const body = await request.json();
    if (
      typeof body.token !== "string" ||
      typeof body.name !== "string" ||
      typeof body.password !== "string"
    )
      throw new AccessError("Solicitud inválida.", 400);
    await infoForPortal(request, body.token);
    return json(
      await acceptInvitation(
        body.token,
        body.name,
        body.password,
        await getPortalUser(request.headers),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
