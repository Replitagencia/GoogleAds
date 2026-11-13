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
