import { requireClient, apiError } from "@/lib/access";
import { getPool } from "@/db";
import { configuration } from "@/lib/google-ads";
import { GA4_SCOPE } from "@/lib/ga4";
import { env } from "@/lib/env";
export async function GET(request: Request) {
  try {
    const { user, clientId } = await requireClient(request, true);
    const config = configuration();
    if (!config.ready)
      return Response.json(
        { error: "Falta configurar Google Cloud." },
        { status: 409 },
      );
    const state = crypto.randomUUID() + crypto.randomUUID();
    await getPool().query(
      "DELETE FROM ga4_oauth_states WHERE expires_at < $1",
      [Date.now()],
    );
    await getPool().query(
      "INSERT INTO ga4_oauth_states(state,user_id,client_id,expires_at) VALUES($1,$2,$3,$4)",
      [state, user.userId, clientId, Date.now() + 600000],
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GA4_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return Response.redirect(url, 303);
  } catch (e) {
    return apiError(e);
  }
}
