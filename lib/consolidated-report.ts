import { sum, zero, shiftDate, shiftMonths, type Metrics } from "./reporting";

export type CampaignDay = Metrics & { date: string; campaignId: string };
export function aggregateCampaignDays(
  rows: CampaignDay[],
  campaignIds: readonly string[],
  start: string,
  end: string,
) {
  const allowed = new Set(campaignIds);
  const byDate = new Map<string, Metrics[]>();
  for (const row of rows) {
    if (!allowed.has(row.campaignId) || row.date < start || row.date > end)
      continue;
    const day = byDate.get(row.date) || [];
    day.push(row);
    byDate.set(row.date, day);
  }
  const days: (Metrics & { date: string })[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    days.push({ date, ...sum(byDate.get(date) || [zero()]) });
  }
  return days;
}

// Keep every other campaign visible; the search row includes the selected PMax.
export function mergeCampaignPair<T extends Metrics & { id: string }>(
  campaigns: T[],
  primaryId: string,
  absorbedId: string,
): T[] {
  const primary = campaigns.find((c) => c.id === primaryId);
  const absorbed = campaigns.find((c) => c.id === absorbedId);
  if (!primary || !absorbed) return campaigns;
  return campaigns
    .filter((c) => c.id !== absorbedId)
    .map((c) =>
      c.id === primaryId ? { ...c, ...sum([primary, absorbed]) } : c,
    );
}

export type MonthlyActivity = {
  month: string;
  impressions: number | null;
  clicks: number | null;
};
/** A missing Google Ads row remains unavailable, rather than being treated as a measured zero. */
export function aggregateCampaignMonths(
  rows: CampaignDay[],
  campaignIds: readonly string[],
  currentMonth: string,
): MonthlyActivity[] {
  const allowed = new Set(campaignIds);
  const counts = new Map<string, { impressions: number; clicks: number }>();
  for (const row of rows) {
    if (!allowed.has(row.campaignId)) continue;
    const key = row.date.slice(0, 7);
    const existing = counts.get(key) || { impressions: 0, clicks: 0 };
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    counts.set(key, existing);
  }
  const first = currentMonth.slice(0, 7) + "-01";
  return Array.from({ length: 13 }, (_, i) => {
    const month = shiftMonths(first, i - 12).slice(0, 7);
    const value = counts.get(month);
    return {
      month,
      impressions: value?.impressions ?? null,
      clicks: value?.clicks ?? null,
    };
  });
}
