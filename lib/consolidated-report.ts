import { sum, zero, shiftDate, type Metrics } from "./reporting";

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
