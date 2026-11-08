import { env } from "cloudflare:workers";
import { and, eq, gt } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { connections, oauthStates } from "@/db/schema";
import { configuration, encryptToken } from "@/lib/google-ads";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (notice: string) => Response.redirect(new URL(`/?view=connection&notice=${notice}`, request.url), 303);
  const user = await getChatGPTUser();
  if (!user || !configuration().ready) return back("setup");
  const state = url.searchParams.get("state");
  if (!state) return back("expired");
  const valid = await getDb().delete(oauthStates).where(and(eq(oauthStates.state, state), eq(oauthStates.userId, user.userId), gt(oauthStates.expiresAt, Date.now()))).returning().get();
  if (!valid) return back("expired");
  if (url.searchParams.has("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: configuration().redirectUri, grant_type: "authorization_code", code }),
  });
  if (!response.ok) return back("failed");
  const tokens = await response.json() as { refresh_token?: string };
  if (!tokens.refresh_token) return back("failed");
  const refreshToken = await encryptToken(tokens.refresh_token);
  await getDb().insert(connections).values({ userId: user.userId, refreshToken, updatedAt: Date.now() }).onConflictDoUpdate({ target: connections.userId, set: { refreshToken, customerId: null, accountName: null, currency: null, timeZone: null, updatedAt: Date.now() } });
  return back("connected");
}
