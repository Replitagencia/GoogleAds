import { periods } from "./reporting";
type RawCache = {
  payload: string | null;
  expires_at: string | number | null;
  currency: string | null;
  time_zone: string | null;
  customer_id: string | null;
};
type Budget = { customer_id: string; month: string; amount: string | number };
export function summarizeAccount(
  row: RawCache,
  budgets: Budget[],
  now = new Date(),
) {
  if (!row.customer_id) return { state: "disconnected" as const };
  if (!row.payload) return { state: "unavailable" as const };
  try {
    const report = JSON.parse(row.payload);
    if (
      report.source !== "google" ||
      report.days !== 30 ||
      String(report.customerId) !== row.customer_id ||
      !report.insights ||
      !report.insights.period ||
      !Array.isArray(report.campaigns)
    )
      return { state: "unavailable" as const };
    const today = periods(30, row.time_zone || "America/Santiago", now);
    const current = report.insights.totals,
      previous = report.insights.previous;
    if (
      !current ||
      !previous ||
      typeof current.cost !== "number" ||
      !Number.isFinite(current.cost) ||
      typeof current.conversions !== "number" ||
      !Number.isFinite(current.conversions) ||
      typeof previous.conversions !== "number" ||
      !Number.isFinite(previous.conversions)
    )
      return { state: "unavailable" as const };
    const fetchedAt =
      typeof report.fetchedAt === "string" &&
      Number.isFinite(Date.parse(report.fetchedAt))
        ? report.fetchedAt
        : null;
    const fresh =
      Number(row.expires_at) > now.getTime() &&
      report.insights.period.today === today.today &&
      !!fetchedAt;
    const budget = budgets.find(
      (b) => b.customer_id === row.customer_id && b.month === today.month,
    );
    const amount = budget ? Number(budget.amount) : null;
    const monthCost =
      report.insights.period.month === today.month &&
      typeof report.insights.monthCost === "number" &&
      Number.isFinite(report.insights.monthCost)
        ? report.insights.monthCost
        : null;
    const change =
      previous.conversions > 0
        ? ((current.conversions - previous.conversions) /
            previous.conversions) *
          100
        : null;
    const statusesQueried =
      Array.isArray(report.campaignStatuses) &&
      Array.isArray(report.insights.unavailable) &&
      !report.insights.unavailable.includes("campaignStatus");
    const statuses = statusesQueried
      ? report.campaignStatuses.filter((c: any) => typeof c?.name === "string")
      : [];
    const statusesAvailable =
      statusesQueried &&
      statuses.length === report.campaignStatuses.length &&
      statuses.every(
        (c: any) =>
          ["ENABLED", "PAUSED", "REMOVED"].includes(c.status) &&
          (c.status !== "ENABLED" ||
            (typeof c.primaryStatus === "string" &&
              !["UNKNOWN", "UNSPECIFIED"].includes(c.primaryStatus))),
      );
    const notServing = statuses.filter(
      (c: any) =>
        c.status === "ENABLED" &&
        ["NOT_ELIGIBLE", "MISCONFIGURED"].includes(c.primaryStatus),
    );
    const paused = statuses.filter((c: any) => c.status === "PAUSED");
    return {
      state: "available" as const,
      fresh,
      expiresAt: Number(row.expires_at) || null,
      fetchedAt,
      currency: row.currency || report.currency || null,
      cost: current.cost,
      conversions: current.conversions,
      clicks:
        typeof current.clicks === "number" && Number.isFinite(current.clicks)
          ? current.clicks
          : null,
      previousConversions: previous.conversions,
      conversionChange: change,
      monthCost,
      budget: amount && Number.isFinite(amount) && amount > 0 ? amount : null,
      campaignStatusAvailable: statusesAvailable,
      notServingCount: notServing.length,
      pausedCount: paused.length,
      notServingCampaigns: notServing
        .map((c: any) => ({
          id: String(c.id),
          name: c.name,
          primaryStatus: c.primaryStatus,
        }))
        .slice(0, 50),
      pausedCampaigns: paused
        .map((c: any) => ({ id: String(c.id), name: c.name }))
        .slice(0, 50),
    };
  } catch {
    return { state: "unavailable" as const };
  }
}
