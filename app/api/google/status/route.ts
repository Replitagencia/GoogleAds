import { requireClient, apiError } from "@/lib/access";
import { configuration, connection, json } from "@/lib/google-ads";
export async function GET(request: Request) {
  try {
    const { user, clientId } = await requireClient(request),
      config = configuration(),
      saved = await connection(clientId);
    return json({
      ready: user.isAdmin && config.ready,
      connected: !!saved,
      customerId: saved?.customerId,
      accountName: saved?.accountName,
      email: user.email,
      ...(user.isAdmin ? { redirectUri: config.redirectUri } : {}),
    });
  } catch (e) {
    return apiError(e);
  }
}
