import { getChatGPTUser } from "@/app/chatgpt-auth";
import { accessToken, connection, errorMessage, json, searchAds } from "@/lib/google-ads";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Inicia sesión." }, 401);
  try {
    const saved = await connection(user.userId);
    if (!saved?.customerId) return json({ error: "Conecta y selecciona una cuenta de Google Ads." }, 409);
    const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
    const dateRange = days === 7 ? "LAST_7_DAYS" : "LAST_30_DAYS";
    const token = await accessToken(user.userId);
    const [campaignRows, dailyRows] = await Promise.all([
      searchAds(token, saved.customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING ${dateRange} AND campaign.status != 'REMOVED'`),
      searchAds(token, saved.customerId, `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date DURING ${dateRange} ORDER BY segments.date`),
    ]);
    const metrics = (row: any) => ({ impressions: Number(row.metrics?.impressions || 0), clicks: Number(row.metrics?.clicks || 0), cost: Number(row.metrics?.costMicros || 0) / 1_000_000, conversions: Number(row.metrics?.conversions || 0) });
    return json({ source: "google", accountName: saved.accountName, customerId: saved.customerId, currency: saved.currency, timeZone: saved.timeZone, fetchedAt: new Date().toISOString(), days, campaigns: campaignRows.map(row => ({ id: row.campaign.id, name: row.campaign.name, status: row.campaign.status, channel: row.campaign.advertisingChannelType, ...metrics(row) })), daily: dailyRows.map(row => ({ date: row.segments.date, ...metrics(row) })) });
  } catch (error) { return json({ error: errorMessage(error) }, 502); }
}
