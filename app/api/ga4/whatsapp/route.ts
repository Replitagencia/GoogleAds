import { requireClient, AccessError, apiError } from "@/lib/access";
import { ga4AccessToken, ga4Connection, ga4Fetch } from "@/lib/ga4";
import { json, errorMessage } from "@/lib/google-ads";
import { periods } from "@/lib/reporting";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    if (clientId !== "c3dd11c2-d156-4b4f-bd10-fa7d3a6ec519")
      return json({ available: false });
    const connection = await ga4Connection(clientId);
    if (!connection?.property_id || connection.property_id !== "508555212")
      return json({ available: false });
    const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
    const p = periods(days, connection.time_zone || "America/Santiago");
    const token = await ga4AccessToken(clientId);
    const data = (await ga4Fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${connection.property_id}:runReport`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          dateRanges: [{ startDate: p.start, endDate: p.end }],
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              stringFilter: {
                matchType: "EXACT",
                value: "Bton_Whatsapp",
                caseSensitive: true,
              },
            },
          },
        }),
      },
    )) as { rows?: { metricValues: { value: string }[] }[] };
    const raw = data.rows?.[0]?.metricValues?.[0]?.value;
    if (raw === undefined) return json({ available: false });
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 0)
      return json({ available: false });
    return json({
      available: true,
      count,
      period: { start: p.start, end: p.end },
      timeZone: connection.time_zone,
    });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ available: false, error: errorMessage(e) }, 502);
  }
}
