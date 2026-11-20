import { AccessError, apiError, requireClient } from "@/lib/access";
import {
  accessToken,
  connection,
  errorMessage,
  json,
  searchAds,
} from "@/lib/google-ads";
import { periods, shiftMonths, sum, type Metrics } from "@/lib/reporting";
import { aggregateCampaignDays } from "@/lib/consolidated-report";
import { eticsaSummary, latestSharedNote } from "@/lib/eticsa-summary";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { eticsaPowerPoint } from "@/lib/weekly-powerpoint";

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

const referenceRows = z
  .array(
    z.object({
      month: z.string(),
      impressions: z.number().int().nonnegative(),
      clicks: z.number().int().nonnegative(),
    }),
  )
  .length(13)
  .refine((rows) =>
    rows.every(
      (r, i) =>
        r.month ===
        new Date(Date.UTC(2025, 10 + i, 1)).toISOString().slice(0, 7),
    ),
  );

// The slide includes a partial November 2026 row. From that month on,
// only whole-account Google Ads observations belong in the chart.
const firstAdsMonth = "2026-11-01";

async function monthlySeries(
  period: ReturnType<typeof periods>,
  query: (q: string) => ReturnType<typeof searchAds>,
) {
  const lastMonth = period.end.slice(0, 7) + "-01";
  const start = shiftMonths(lastMonth, -12);
  const bounds = { start, end: period.end, currentMonth: period.month };
  try {
    const counts = new Map<string, { impressions: number; clicks: number }>();
    if (start < firstAdsMonth) {
      const file = await readFile(
        process.env.ETICSA_HISTORY_FILE ||
          "/opt/agencialabs/eticsa-slide-2026-11.json",
        "utf8",
      );
      for (const row of referenceRows.parse(JSON.parse(file))) {
        if (row.month < firstAdsMonth.slice(0, 7)) counts.set(row.month, row);
      }
    }
    const from = start > firstAdsMonth ? start : firstAdsMonth;
    if (from <= period.end) {
      const rows = await query(
        `SELECT segments.month, metrics.impressions, metrics.clicks FROM customer WHERE segments.date BETWEEN '${from}' AND '${period.end}'`,
      );
      for (const row of rows) {
        counts.set(row.segments.month.slice(0, 7), {
          impressions: Number(row.metrics.impressions ?? 0),
          clicks: Number(row.metrics.clicks ?? 0),
        });
      }
    }
    const months = Array.from({ length: 13 }, (_, i) => {
      const month = shiftMonths(start, i).slice(0, 7);
      return {
        month,
        ...(counts.get(month) ?? { impressions: null, clicks: null }),
      };
    });
    return { ...bounds, status: "available" as const, months };
  } catch {
    return { ...bounds, status: "unavailable" as const, months: [] };
  }
}

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
    if (new URL(request.url).searchParams.get("view") === "summary")
      return json(
        await eticsaSummary(
          clientId,
          ETICSA_ACCOUNT,
          saved.timeZone || "America/Santiago",
          period.end,
          saved.currency || "CLP",
          query,
        ),
      );
    const monthlyHistory = await monthlySeries(period, query);
    if (new URL(request.url).searchParams.get("view") === "monthly")
      return json({ monthlyHistory });
    const selected = `campaign.id IN (${CAMPAIGN_IDS.join(",")})`;
    const scopeLabel = "Campaña de Busqueda + Pmax Eticsa";
    const campaigns = await query(
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE ${selected}`,
    );
    const found = new Set(campaigns.map((r) => String(r.campaign?.id)));
    if (CAMPAIGN_IDS.some((id) => !found.has(id)))
      return json(
        {
          error:
            "No fue posible verificar las dos campañas configuradas para el reporte. Contacta a AgenciaLabs.",
        },
        409,
      );
    const history = await query(
      `SELECT campaign.id, segments.date, ${fields} FROM campaign WHERE ${selected} AND segments.date BETWEEN '${period.previousStart}' AND '${period.end}' ORDER BY segments.date`,
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
    const report = {
      source: "google",
      agencyNote: await latestSharedNote(
        clientId,
        ETICSA_ACCOUNT,
        saved.timeZone || "America/Santiago",
      ),
      accountName: saved.accountName,
      customerId: saved.customerId,
      currency: saved.currency,
      timeZone: saved.timeZone,
      fetchedAt: new Date().toISOString(),
      days: 7,
      scopeLabel,
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
      monthlyHistory,
      insights: {
        period,
        totals: sum(daily),
        previous: sum(previous),
        terms: currentTerms,
        previousTerms,
        unavailable,
      },
    };
    if (new URL(request.url).searchParams.get("format") === "pptx") {
      const logo = await readFile("public/client-logos/eticsa-report.png");
      const bytes = await eticsaPowerPoint(report, logo);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition":
            'attachment; filename="Reporte-Google-Ads-' +
            period.start +
            "-" +
            period.end +
            '.pptx"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json(report);
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
