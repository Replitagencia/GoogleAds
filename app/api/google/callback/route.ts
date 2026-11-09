import { env } from "@/lib/env";
import { and, eq, gt } from "drizzle-orm";
import { requireAdmin, clientAccess, apiError } from "@/lib/access";
import { getDb } from "@/db";
import { connections, oauthStates } from "@/db/schema";
import { configuration, encryptToken } from "@/lib/google-ads";
export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request.headers),
      url = new URL(request.url),
      state = url.searchParams.get("state");
    const back = (notice: string, clientId = "") =>
      Response.redirect(
        new URL(
          `/?clientId=${clientId}&view=connection&notice=${notice}`,
          env.SITE_URL,
        ),
        303,
      );
    if (!state || !configuration().ready) return back("expired");
    const [valid] = await getDb()
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.state, state),
          eq(oauthStates.userId, user.userId),
          gt(oauthStates.expiresAt, Date.now()),
        ),
      )
      .returning();
    if (!valid) return back("expired");
    await clientAccess(user, valid.clientId);
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error"))
      return back("cancelled", valid.clientId);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: configuration().redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!response.ok) return back("failed", valid.clientId);
    const tokens = (await response.json()) as { refresh_token?: string };
    if (!tokens.refresh_token) return back("failed", valid.clientId);
    const refreshToken = await encryptToken(tokens.refresh_token);
    await getDb()
      .insert(connections)
      .values({ clientId: valid.clientId, refreshToken, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: connections.clientId,
        set: {
          refreshToken,
          customerId: null,
          accountName: null,
          currency: null,
          timeZone: null,
          updatedAt: Date.now(),
        },
      });
    return back("connected", valid.clientId);
  } catch (e) {
    return apiError(e);
  }
}
