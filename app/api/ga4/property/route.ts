import { requireClient, AccessError, apiError } from "@/lib/access";
import { ga4AccessToken, ga4Fetch } from "@/lib/ga4";
import { json, sameOrigin, errorMessage } from "@/lib/google-ads";
import { getPool } from "@/db";
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request, true);
    if (!sameOrigin(request))
      return json({ error: "Origen no permitido." }, 403);
    const body = await request.json(),
      id = String(body.propertyId || "").trim();
    if (!/^\d{4,16}$/.test(id))
      return json(
        { error: "Ingresa el ID numérico de la propiedad GA4." },
        400,
      );
    const token = await ga4AccessToken(clientId);
    const property = (await ga4Fetch(
      `https://analyticsadmin.googleapis.com/v1beta/properties/${id}`,
      token,
    )) as { name?: string; displayName?: string; timeZone?: string };
    if (property.name !== `properties/${id}` || !property.timeZone)
      return json({ error: "No se pudo verificar la propiedad." }, 400);
    await ga4Fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          metrics: [{ name: "sessions" }],
          limit: 1,
        }),
      },
    );
    await getPool().query(
      "UPDATE ga4_connections SET property_id=$2,property_name=$3,time_zone=$4,updated_at=$5 WHERE client_id=$1",
      [clientId, id, property.displayName || id, property.timeZone, Date.now()],
    );
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 400);
  }
}
