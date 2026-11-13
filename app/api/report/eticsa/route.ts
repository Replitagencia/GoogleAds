import { AccessError, apiError, requireClient } from "@/lib/access";
import {
  accessToken,
  connection,
  errorMessage,
  json,
  searchAds,
} from "@/lib/google-ads";
import { periods, sum, type Metrics } from "@/lib/reporting";
import { aggregateCampaignDays } from "@/lib/consolidated-report";

const ETICSA_CLIENT = "c3dd11c2-d156-4b4f-bd10-fa7d3a6ec519";
const ETICSA_ACCOUNT = "3213724556";
const CAMPAIGN_IDS = ["23169711798", "23461440880"] as const;
const fields =
  "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions";
const metrics = (row: any): Metrics => ({
  impressions: Number(row.metrics?.impressions || 0),
  clicks: Number(row.metrics?.clicks || 0),
  cost: Number(row.metrics?.costMicros || 0) / 1e6,
  conversions: Number(row.metrics?.conversions || 0),
});

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    if (clientId !== ETICSA_CLIENT)
      throw new AccessError("Reporte no disponible.", 404);
    const saved = await connection(clientId);
    if (!saved || saved.customerId !== ETICSA_ACCOUNT)
      return json(
        {
          error:
            "La cuenta conectada no coincide con la cuenta configurada para este reporte. Contacta a AgenciaLabs.",
        },
        409,
      );
    const period = periods(7, saved.timeZone || "America/Santiago");
    const token = await accessToken(clientId);
    const query = (q: string) => searchAds(token, saved.customerId!, q);
    const selected = `campaign.id IN (${CAMPAIGN_IDS.join(",")})`;
    const [campaigns, history] = await Promise.all([
      query(
        `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE ${selected}`,
      ),
      query(
        `SELECT campaign.id, segments.date, ${fields} FROM campaign WHERE ${selected} AND segments.date BETWEEN '${period.previousStart}' AND '${period.end}' ORDER BY segments.date`,
      ),
    ]);
    const found = new Set(campaigns.map((r) => String(r.campaign?.id)));
    if (CAMPAIGN_IDS.some((id) => !found.has(id)))
      return json(
        {
          error:
            "No fue posible verificar las dos campañas configuradas para el reporte. Contacta a AgenciaLabs.",
        },
        409,
      );
    const unavailable: string[] = [];
    const terms = async (start: string, end: string, key: string) => {
      try {
        const rows = await query(
          `SELECT search_term_view.resource_name, search_term_view.search_term, campaign.name, ${fields} FROM search_term_view WHERE ${selected} AND segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0 ORDER BY metrics.clicks DESC LIMIT 100`,
        );
        return rows.map((r) => ({
          id: r.searchTermView.resourceName,
          label: r.searchTermView.searchTerm,
          detail: r.campaign.name,
          ...metrics(r),
        }));
      } catch {
        unavailable.push(key);
        return [];
      }
    };
    const [currentTerms, previousTerms] = await Promise.all([
      terms(period.start, period.end, "terms"),
      terms(period.previousStart, period.previousEnd, "previousTerms"),
    ]);
    const historyRows = history.map((r) => ({
      campaignId: String(r.campaign.id),
      date: r.segments.date,
      ...metrics(r),
    }));
    const daily = aggregateCampaignDays(
      historyRows,
      CAMPAIGN_IDS,
      period.start,
      period.end,
    );
    const previous = aggregateCampaignDays(
      historyRows,
      CAMPAIGN_IDS,
      period.previousStart,
      period.previousEnd,
    );
    return json({
      source: "google",
      accountName: saved.accountName,
      customerId: saved.customerId,
      currency: saved.currency,
      timeZone: saved.timeZone,
      fetchedAt: new Date().toISOString(),
      days: 7,
      scopeLabel: "Campaña de Busqueda + Pmax Eticsa",
      campaigns: campaigns.map((r) => ({
        id: String(r.campaign.id),
        name: r.campaign.name,
        status: r.campaign.status,
        channel: r.campaign.advertisingChannelType,
        ...sum(
          historyRows.filter(
            (row) =>
              row.campaignId === String(r.campaign.id) &&
              row.date >= period.start &&
              row.date <= period.end,
          ),
        ),
      })),
      daily,
      insights: {
        period,
        totals: sum(daily),
        previous: sum(previous),
        terms: currentTerms,
        previousTerms,
        unavailable,
      },
    });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
