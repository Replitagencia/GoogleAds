import { requireClient, AccessError, apiError } from "@/lib/access";
import {
  accessToken,
  connection,
  errorMessage,
  json,
  searchAds,
} from "@/lib/google-ads";
import { mergeCampaignPair } from "@/lib/consolidated-report";
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
    const params = new URL(request.url).searchParams;
    const scoped =
      clientId === "c3dd11c2-d156-4b4f-bd10-fa7d3a6ec519" &&
      params.get("scope") === "selected";
    if (scoped && saved.customerId !== "3213724556")
      return json(
        {
          error:
            "La cuenta conectada no coincide con las campañas seleccionadas. Contacta a AgenciaLabs.",
        },
        409,
      );
    const campaignIds = ["23169711798", "23461440880"];
    const scopeFilter = "";
    const days = params.get("days") === "7" ? 7 : 30;
    const period = periods(days, saved.timeZone || "America/Santiago");
    const cacheId = `${scoped ? "grouped-v2" : "v2"}:${clientId}:${saved.customerId}:${saved.updatedAt}:${days}:${period.today}`;
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
    const [campaignRows, historyRows, campaignMeta, accountMonth] =
      await Promise.all([
        query(
          `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${fields} FROM campaign WHERE ${range}${scopeFilter}`,
        ),
        query(
          `SELECT segments.date, ${fields} FROM ${scoped ? "campaign" : "customer"} WHERE segments.date BETWEEN '${period.historyStart}' AND '${period.end}'${scopeFilter} ORDER BY segments.date`,
        ),
        scoped
          ? query(
              `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign`,
            )
          : Promise.resolve([]),
        scoped && period.elapsedDays > 0
          ? query(
              `SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${period.monthStart}' AND '${period.end}'`,
            )
          : Promise.resolve([]),
      ]);
    if (
      scoped &&
      campaignIds.some(
        (id) => !campaignMeta.some((r) => String(r.campaign?.id) === id),
      )
    )
      return json(
        {
          error:
            "No fue posible verificar las dos campañas seleccionadas. Contacta a AgenciaLabs.",
        },
        409,
      );
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
      previousTermRows,
    ] = await Promise.all([
      optional(
        "devices",
        `SELECT segments.device, ${fields} FROM ${scoped ? "campaign" : "customer"} WHERE ${range}${scopeFilter}`,
      ),
      optional(
        "locations",
        `SELECT geographic_view.country_criterion_id, segments.geo_target_region, ${fields} FROM geographic_view WHERE ${range} AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'${scopeFilter}`,
      ),
      optional(
        "keywords",
        `SELECT keyword_view.resource_name, campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ${fields} FROM keyword_view WHERE ${range} AND metrics.impressions > 0${scopeFilter} ORDER BY metrics.clicks DESC LIMIT 50`,
      ),
      optional(
        "terms",
        `SELECT search_term_view.resource_name, search_term_view.search_term, campaign.name, ${fields} FROM search_term_view WHERE ${range} AND metrics.impressions > 0${scopeFilter} ORDER BY metrics.clicks DESC LIMIT 50`,
      ),
      optional(
        "ads",
        `SELECT ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, campaign.name, ${fields} FROM ad_group_ad WHERE ${range} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND metrics.impressions > 0${scopeFilter} ORDER BY metrics.conversions DESC, metrics.clicks DESC LIMIT 20`,
      ),
      optional(
        "conversions",
        `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != 'REMOVED'`,
      ),
      optional(
        "conversionMetrics",
        `SELECT segments.conversion_action, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM ${scoped ? "campaign" : "customer"} WHERE ${range}${scopeFilter}`,
      ),
      optional(
        "campaignStatus",
        `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status FROM campaign WHERE campaign.status != 'REMOVED'${scopeFilter}`,
      ),
      days === 7
        ? optional(
            "previousTerms",
            `SELECT search_term_view.resource_name, search_term_view.search_term, campaign.name, ${fields} FROM search_term_view WHERE segments.date BETWEEN '${period.previousStart}' AND '${period.previousEnd}' AND metrics.impressions > 0${scopeFilter} ORDER BY metrics.clicks DESC LIMIT 100`,
          )
        : Promise.resolve([]),
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
      daily.push({ date: key, ...sum(history.filter((r) => r.date === key)) });
    }
    const devices = new Map<string, Breakdown>();
    for (const r of deviceRows) {
      const id = r.segments.device;
      const old = devices.get(id);
      devices.set(id, {
        id,
        label:
          (
            {
              MOBILE: "Celulares",
              DESKTOP: "Computadores",
              TABLET: "Tablets",
              CONNECTED_TV: "TV conectada",
            } as Record<string, string>
          )[id] || "Otros",
        ...sum([old || zero(), metrics(r)]),
      });
    }
    const campaignList = (
      scoped
        ? campaignMeta.filter(
            (r) =>
              r.campaign.status !== "REMOVED" ||
              campaignIds.includes(String(r.campaign.id)),
          )
        : campaignRows
    ).map((r) => ({
      id: String(r.campaign.id),
      name: r.campaign.name,
      status: r.campaign.status,
      channel: r.campaign.advertisingChannelType,
      ...metrics(
        scoped
          ? campaignRows.find(
              (c) => String(c.campaign.id) === String(r.campaign.id),
            ) || {}
          : r,
      ),
    }));
    const report = {
      source: "google",
      accountName: saved.accountName,
      customerId: saved.customerId,
      currency: saved.currency,
      timeZone: saved.timeZone,
      fetchedAt: new Date().toISOString(),
      days,
      ...(scoped ? { scopeLabel: "Campaña de Busqueda + Pmax Eticsa" } : {}),
      campaigns: scoped
        ? mergeCampaignPair(campaignList, campaignIds[0], campaignIds[1])
        : campaignList,
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
        monthCost: scoped
          ? sum(accountMonth.map(metrics)).cost
          : sum(history.filter((r) => r.date >= period.monthStart)).cost,
        devices: [...devices.values()],
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
        previousTerms: previousTermRows.map((r) => ({
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
