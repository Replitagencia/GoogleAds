import type { Report } from "./demo";
import type { Breakdown, Insights, Metrics } from "./reporting";

export type WeeklyReport = Pick<
  Report,
  | "source"
  | "days"
  | "scopeLabel"
  | "fetchedAt"
  | "agencyNote"
  | "monthlyHistory"
> & {
  currency: string | null;
  timeZone: string | null;
  insights?: Pick<
    Insights,
    "period" | "totals" | "previous" | "terms" | "previousTerms" | "unavailable"
  >;
};

export function weeklyReportContent(report: WeeklyReport) {
  if (report.source !== "google" || report.days !== 7 || !report.insights)
    throw new Error("No hay resultados reales del período disponibles.");
  const info = report.insights,
    p = info.period;
  const number = (n: number) =>
    new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(n);
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: report.currency || "CLP",
      maximumFractionDigits: report.currency === "CLP" ? 0 : 2,
    }).format(n);
  const date = (s: string) =>
    new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(s + "T12:00:00Z"));
  const current = `${date(p.start)} al ${date(p.end)}`,
    previous = `${date(p.previousStart)} al ${date(p.previousEnd)}`;
  const ctr = (m: Metrics) =>
    m.impressions
      ? `${((m.clicks / m.impressions) * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`
      : "—";
  const cpc = (m: Metrics) => (m.clicks ? money(m.cost / m.clicks) : "—");
  function aggregate(terms: Breakdown[]) {
    const m = new Map<string, Breakdown>();
    for (const a of terms) {
      const key = a.label.trim().toLocaleLowerCase("es");
      const old = m.get(key);
      if (old) {
        old.impressions += a.impressions;
        old.clicks += a.clicks;
      } else m.set(key, { ...a });
    }
    return [...m.values()];
  }
  const terms = aggregate(info.terms || []),
    oldTerms = aggregate(info.previousTerms || []);
  const termUnavailable = info.unavailable.includes("terms");
  const change = (v: number, old: number) =>
    old === 0
      ? v === 0
        ? "Sin variación; ambos períodos registran cero."
        : "Sin porcentaje comparable: el período anterior registró cero."
      : `${v >= old ? "Aumentó" : "Disminuyó"} ${number(Math.abs(((v - old) / old) * 100))} % frente al período anterior.`;
  return {
    info,
    p,
    number,
    money,
    date,
    current,
    previous,
    ctr,
    cpc,
    terms,
    oldTerms,
    termUnavailable,
    change,
  };
}
