import { env } from "cloudflare:workers";
import { lt } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { oauthStates } from "@/db/schema";
import { ADS_SCOPE, configuration } from "@/lib/google-ads";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.redirect(new URL("/signin-with-chatgpt?return_to=/", request.url), 303);
  const config = configuration();
  if (!config.ready) return Response.redirect(new URL("/?view=connection&notice=setup", request.url), 303);
  const state = crypto.randomUUID() + crypto.randomUUID();
  await getDb().delete(oauthStates).where(lt(oauthStates.expiresAt, Date.now()));
  await getDb().insert(oauthStates).values({ state, userId: user.userId, expiresAt: Date.now() + 600_000 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: config.redirectUri, response_type: "code", scope: ADS_SCOPE, access_type: "offline", prompt: "consent", state }).toString();
  return Response.redirect(url, 303);
}
