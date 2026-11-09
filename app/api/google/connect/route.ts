import { env } from "@/lib/env";
import { lt } from "drizzle-orm";
import { requireClient, apiError } from "@/lib/access";
import { getDb } from "@/db";
import { oauthStates } from "@/db/schema";
import { ADS_SCOPE, configuration } from "@/lib/google-ads";
export async function GET(request: Request) {
  try {
    const { user, clientId } = await requireClient(request, true),
      config = configuration();
    if (!config.ready)
      return Response.redirect(
        new URL(
          `/?clientId=${clientId}&view=connection&notice=setup`,
          env.SITE_URL,
        ),
        303,
      );
    const state = crypto.randomUUID() + crypto.randomUUID();
    await getDb()
      .delete(oauthStates)
      .where(lt(oauthStates.expiresAt, Date.now()));
    await getDb()
      .insert(oauthStates)
      .values({
        state,
        userId: user.userId,
        clientId,
        expiresAt: Date.now() + 600000,
      });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: ADS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return Response.redirect(url, 303);
  } catch (e) {
    return apiError(e);
  }
}
