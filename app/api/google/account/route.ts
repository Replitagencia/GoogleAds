import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { accessToken, errorMessage, json, sameOrigin, searchAds } from "@/lib/google-ads";
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Inicia sesión." }, 401);
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  try {
    const body = await request.json() as { customerId?: string };
    const customerId = String(body.customerId || "").replace(/[ -]/g, "");
    if (!/^\d{10}$/.test(customerId)) return json({ error: "Escribe un ID de Google Ads de 10 dígitos." }, 400);
    const rows = await searchAds(await accessToken(user.userId), customerId, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1");
    const account = rows[0]?.customer;
    if (!account || account.manager) return json({ error: "Selecciona una cuenta de campañas, no una cuenta de administrador (MCC)." }, 400);
    await getDb().update(connections).set({ customerId, accountName: account.descriptiveName || customerId, currency: account.currencyCode, timeZone: account.timeZone, updatedAt: Date.now() }).where(eq(connections.userId, user.userId));
    return json({ ok: true });
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
}
