import { env } from "@/lib/env";
import { and, eq, gt } from "drizzle-orm";
import { requireAdmin, clientAccess, apiError } from "@/lib/access";
import { getDb } from "@/db";
import { connections, oauthStates } from "@/db/schema";
import { configuration, encryptToken } from "@/lib/google-ads";
import { getPool } from "@/db";
import { GA4_SCOPE } from "@/lib/ga4";
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
    const ga4State = await getPool().query(
      "DELETE FROM ga4_oauth_states WHERE state=$1 AND user_id=$2 AND expires_at>$3 RETURNING client_id",
      [state, user.userId, Date.now()],
    );
    if (ga4State.rows[0]) {
      const clientId = ga4State.rows[0].client_id as string;
      await clientAccess(user, clientId);
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error"))
        return back("ga4_cancelled", clientId);
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
      if (!response.ok) return back("ga4_failed", clientId);
      const tokens = (await response.json()) as {
        refresh_token?: string;
        scope?: string;
      };
      if (
        !tokens.refresh_token ||
        !tokens.scope?.split(" ").includes(GA4_SCOPE)
      )
        return back("ga4_failed", clientId);
      const encrypted = await encryptToken(tokens.refresh_token);
      await getPool().query(
        "INSERT INTO ga4_connections(client_id,refresh_token,updated_at) VALUES($1,$2,$3) ON CONFLICT(client_id) DO UPDATE SET refresh_token=EXCLUDED.refresh_token,property_id=NULL,property_name=NULL,time_zone=NULL,updated_at=EXCLUDED.updated_at",
        [clientId, encrypted, Date.now()],
      );
      return back("ga4_connected", clientId);
    }
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
