import { invitationInfo, acceptInvitation } from "@/lib/invitations";
import { getPortalUser, apiError, AccessError } from "@/lib/access";
import { sameOrigin, json } from "@/lib/google-ads";
export async function GET(request: Request) {
  try {
    return json(
      await invitationInfo(
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
