import { getAuth } from "@/lib/auth";
import { portalForHeaders } from "@/lib/portals";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const portal = portalForHeaders(request.headers);
  if (!portal)
    return Response.json({ error: "Portal no permitido." }, { status: 400 });
  return getAuth(portal).handler(request);
}
export function POST(request: Request) {
  return GET(request);
}
