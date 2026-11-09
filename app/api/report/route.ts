import { requireClient, AccessError, apiError } from "@/lib/access";
import {
  accessToken,
  connection,
  errorMessage,
  json,
  searchAds,
} from "@/lib/google-ads";
import { getDb } from "@/db";
import { reportCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  periods,
  sum,
  zero,
  type Metrics,
  type Breakdown,
  type Conversion,
} from "@/lib/reporting";
const metrics = (row: any): Metrics => ({
  impressions: Number(row.metrics?.impressions || 0),
  clicks: Number(row.metrics?.clicks || 0),
  cost: Number(row.metrics?.costMicros || 0) / 1e6,
  conversions: Number(row.metrics?.conversions || 0),
});
const fields =
  "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions";
export async function GET(request: Request) {
  try {
    const { clientId, user } = await requireClient(request);
    const saved = await connection(clientId);
    if (!saved?.customerId)
      return json(
        { error: "Conecta y selecciona una cuenta de Google Ads." },
        409,
      );
    const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
    const period = periods(days, saved.timeZone || "America/Santiago");
    const cacheId = `v2:${clientId}:${saved.customerId}:${saved.updatedAt}:${days}:${period.today}`;
    const cached = await getDb()
      .select()
      .from(reportCache)
      .where(eq(reportCache.id, cacheId))
      .then((rows) => rows[0]);
    const force =
      user.isAdmin && new URL(request.url).searchParams.get("refresh") === "1";
    if (cached && cached.expiresAt > Date.now() && !force)
      return json(JSON.parse(cached.payload));
    const token = await accessToken(clientId),
      query = (q: string) => searchAds(token, saved.customerId!, q);
    const range = `segments.date BETWEEN '${period.start}' AND '${period.end}'`;
    const [campaignRows, historyRows] = await Promise.all([
      query(
        `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${fields} FROM campaign WHERE ${range}`,
      ),
      query(
        `SELECT segments.date, ${fields} FROM customer WHERE segments.date BETWEEN '${period.historyStart}' AND '${period.end}' ORDER BY segments.date`,
      ),
    ]);
    const unavailable: string[] = [];
    const optional = async (name: string, q: string) => {
      try {
        return await query(q);
      } catch (e) {
        unavailable.push(name);
        console.warn(`Google Ads ${name}: ${errorMessage(e)}`);
        return [];
      }
    };
    const [
      deviceRows,
      locationRows,
      keywordRows,
      termRows,
      adRows,
      actionRows,
      conversionRows,
      campaignStatusRows,
    ] = await Promise.all([
      optional(
        "devices",
        `SELECT segments.device, ${fields} FROM customer WHERE ${range}`,
      ),
      optional(
        "locations",
        `SELECT geographic_view.country_criterion_id, segments.geo_target_region, ${fields} FROM geographic_view WHERE ${range} AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'`,
      ),
      optional(
        "keywords",
        `SELECT keyword_view.resource_name, campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ${fields} FROM keyword_view WHERE ${range} AND metrics.impressions > 0 ORDER BY metrics.clicks DESC LIMIT 50`,
      ),
      optional(
        "terms",
        `SELECT search_term_view.resource_name, search_term_view.search_term, campaign.name, ${fields} FROM search_term_view WHERE ${range} AND metrics.impressions > 0 ORDER BY metrics.clicks DESC LIMIT 50`,
      ),
      optional(
        "ads",
        `SELECT ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, campaign.name, ${fields} FROM ad_group_ad WHERE ${range} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND metrics.impressions > 0 ORDER BY metrics.conversions DESC, metrics.clicks DESC LIMIT 20`,
      ),
      optional(
        "conversions",
        `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != 'REMOVED'`,
      ),
      optional(
        "conversionMetrics",
        `SELECT segments.conversion_action, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM customer WHERE ${range}`,
      ),
      optional(
        "campaignStatus",
        "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status FROM campaign WHERE campaign.status != 'REMOVED'",
      ),
    ]);
    const geoNames = new Map<string, string>();
    const geoIds = [
      ...new Set(
        locationRows.map(
          (r) =>
            r.segments?.geoTargetRegion ||
            `geoTargetConstants/${r.geographicView.countryCriterionId}`,
        ),
      ),
    ].filter(
      (v): v is string =>
        typeof v === "string" && /^geoTargetConstants\/\d+$/.test(v),
    );
    if (geoIds.length) {
      const names = await optional(
        "locationNames",
        `SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${geoIds.map((v) => `'${v}'`).join(",")})`,
      );
      names.forEach((r) =>
        geoNames.set(
          r.geoTargetConstant.resourceName,
          r.geoTargetConstant.canonicalName,
        ),
      );
    }
    const locations = new Map<string, Breakdown>();
    locationRows.forEach((r) => {
      const id =
        r.segments?.geoTargetRegion ||
        `geoTargetConstants/${r.geographicView.countryCriterionId}`;
      const old = locations.get(id);
      locations.set(id, {
        id,
        label: geoNames.get(id) || `Ubicación ${id.split("/").pop()}`,
        ...sum([old || zero(), metrics(r)]),
      });
    });
    const conversions = new Map<string, Conversion>();
    actionRows.forEach((r) => {
      const a = r.conversionAction;
      conversions.set(a.resourceName, {
        id: a.resourceName,
        name: a.name,
        category: a.category,
        status: a.status,
        primary: !!a.primaryForGoal,
        conversions: 0,
        allConversions: 0,
      });
    });
    conversionRows.forEach((r) => {
      const id = r.segments.conversionAction;
      const a = conversions.get(id) || {
        id,
        name: r.segments.conversionActionName,
        category: "UNKNOWN",
        status: "UNKNOWN",
        primary: false,
        conversions: 0,
        allConversions: 0,
      };
      a.conversions += Number(r.metrics?.conversions || 0);
      a.allConversions += Number(r.metrics?.allConversions || 0);
      conversions.set(id, a);
    });
    const history = historyRows.map((r) => ({
        date: r.segments.date,
        ...metrics(r),
      })),
      daily = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(period.start + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10);
      daily.push(
        history.find((r) => r.date === key) || { date: key, ...zero() },
      );
    }
    const report = {
      source: "google",
      accountName: saved.accountName,
      customerId: saved.customerId,
      currency: saved.currency,
      timeZone: saved.timeZone,
      fetchedAt: new Date().toISOString(),
      days,
      campaigns: campaignRows.map((r) => ({
        id: r.campaign.id,
        name: r.campaign.name,
        status: r.campaign.status,
        channel: r.campaign.advertisingChannelType,
        ...metrics(r),
      })),
      campaignStatuses: campaignStatusRows.map((r) => ({
        id: r.campaign.id,
        name: r.campaign.name,
        status: r.campaign.status,
        primaryStatus: r.campaign.primaryStatus || null,
      })),
      daily,
      insights: {
        period,
        totals: sum(daily),
        previous: sum(
          history.filter(
            (r) =>
              r.date >= period.previousStart && r.date <= period.previousEnd,
          ),
        ),
        monthCost: sum(history.filter((r) => r.date >= period.monthStart)).cost,
        devices: deviceRows.map((r) => ({
          id: r.segments.device,
          label:
            (
              {
                MOBILE: "Celulares",
                DESKTOP: "Computadores",
                TABLET: "Tablets",
                CONNECTED_TV: "TV conectada",
              } as Record<string, string>
            )[r.segments.device] || "Otros",
          ...metrics(r),
        })),
        locations: [...locations.values()].sort((a, b) => b.clicks - a.clicks),
        keywords: keywordRows.map((r) => ({
          id: r.keywordView.resourceName,
          label: r.adGroupCriterion.keyword.text,
          detail: `${r.campaign.name} · ${r.adGroupCriterion.keyword.matchType}`,
          ...metrics(r),
        })),
        terms: termRows.map((r) => ({
          id: r.searchTermView.resourceName,
          label: r.searchTermView.searchTerm,
          detail: r.campaign.name,
          ...metrics(r),
        })),
        ads: adRows.map((r) => ({
          id: r.adGroupAd.resourceName,
          label:
            (r.adGroupAd.ad.responsiveSearchAd?.headlines || [])
              .map((v: any) => v.text)
              .join(" · ") || `Anuncio ${r.adGroupAd.ad.id}`,
          detail: r.campaign.name,
          ...metrics(r),
        })),
        conversions: [...conversions.values()],
        unavailable,
      },
    };
    await getDb()
      .insert(reportCache)
      .values({
        id: cacheId,
        payload: JSON.stringify(report),
        expiresAt: Date.now() + 300000,
      })
      .onConflictDoUpdate({
        target: reportCache.id,
        set: {
          payload: JSON.stringify(report),
          expiresAt: Date.now() + 300000,
        },
      });
    return json(report);
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
