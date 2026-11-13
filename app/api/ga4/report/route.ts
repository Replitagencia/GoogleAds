import { requireClient, AccessError, apiError } from "@/lib/access";
import { ga4AccessToken, ga4Connection, ga4Fetch } from "@/lib/ga4";
import { json, errorMessage } from "@/lib/google-ads";
import { periods } from "@/lib/reporting";
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const c = await ga4Connection(clientId);
    if (!c?.property_id) return json({ connected: false });
    const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
    const p = periods(days, c.time_zone || "America/Santiago");
    const token = await ga4AccessToken(clientId);
    const data = (await ga4Fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${c.property_id}:runReport`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: p.start, endDate: p.end }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "engagedSessions" },
            { name: "keyEvents" },
          ],
        }),
      },
    )) as { rows?: { metricValues: { value: string }[] }[] };
    const values = data.rows?.[0]?.metricValues || [];
    return json({
      connected: true,
      propertyName: c.property_name,
      period: { start: p.start, end: p.end },
      timeZone: c.time_zone,
      metrics: {
        sessions: Number(values[0]?.value || 0),
        users: Number(values[1]?.value || 0),
        engagedSessions: Number(values[2]?.value || 0),
        keyEvents: Number(values[3]?.value || 0),
      },
    });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
