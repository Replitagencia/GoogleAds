import { eq } from "drizzle-orm";
import { requireClient, AccessError, apiError } from "@/lib/access";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import {
  accessToken,
  errorMessage,
  json,
  sameOrigin,
  searchAds,
} from "@/lib/google-ads";
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request, true);
    if (!sameOrigin(request))
      return json({ error: "Origen no permitido." }, 403);
    const body = await request.json(),
      customerId = String(body.customerId || "").replace(/[ -]/g, "");
    if (!/^\d{10}$/.test(customerId))
      return json({ error: "Escribe un ID de Google Ads de 10 dígitos." }, 400);
    const rows = await searchAds(
        await accessToken(clientId),
        customerId,
        "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
      ),
      account = rows[0]?.customer;
    if (!account || account.manager)
      return json(
        { error: "Selecciona una cuenta de campañas, no un MCC." },
        400,
      );
    await getDb()
      .update(connections)
      .set({
        customerId,
        accountName: account.descriptiveName || customerId,
        currency: account.currencyCode,
        timeZone: account.timeZone,
        updatedAt: Date.now(),
      })
      .where(eq(connections.clientId, clientId));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 400);
  }
}
