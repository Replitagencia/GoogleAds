import { ga4AccessToken, ga4Connection, ga4Fetch } from "./ga4";
export async function whatsappEvents(
  clientId: string,
  start: string,
  end: string,
) {
  const connection = await ga4Connection(clientId);
  if (connection?.property_id !== "508555212") return null;
  const token = await ga4AccessToken(clientId);
  const data = (await ga4Fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${connection.property_id}:runReport`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
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
  if (raw === undefined) return null;
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return count;
}
