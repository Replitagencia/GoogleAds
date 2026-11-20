export type Metrics = {
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
};
export const zero = (): Metrics => ({
  cost: 0,
  clicks: 0,
  impressions: 0,
  conversions: 0,
});
export function sum(rows: Metrics[]): Metrics {
  return rows.reduce(
    (a, r) => ({
      cost: a.cost + r.cost,
      clicks: a.clicks + r.clicks,
      impressions: a.impressions + r.impressions,
      conversions: a.conversions + r.conversions,
    }),
    zero(),
  );
}
export function dateInZone(now: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((v) => v.type === k)!.value)
    .join("-");
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function periods(days: number, timeZone: string, now = new Date()) {
  const today = dateInZone(now, timeZone),
    end = shiftDate(today, -1),
    start = shiftDate(today, -days),
    previousStart = shiftDate(today, -days * 2),
    previousEnd = shiftDate(start, -1),
    month = today.slice(0, 7),
    monthStart = month + "-01";
  return {
    start,
    end,
    previousStart,
    previousEnd,
    month,
    monthStart,
    today,
    elapsedDays: Number(today.slice(8)) - 1,
    monthDays: new Date(
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
    ).getUTCDate(),
    historyStart: previousStart < monthStart ? previousStart : monthStart,
  };
}
export function change(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}
export type Breakdown = Metrics & {
  id: string;
  label: string;
  detail?: string;
};
export type Conversion = {
  id: string;
  name: string;
  category: string;
  status: string;
  primary: boolean;
  conversions: number;
  allConversions: number;
};
export type Insights = {
  period: ReturnType<typeof periods>;
  totals: Metrics;
  previous: Metrics;
  monthCost: number;
  devices: Breakdown[];
  locations: Breakdown[];
  keywords: Breakdown[];
  terms: Breakdown[];
  previousTerms?: Breakdown[];
  ads: Breakdown[];
  conversions: Conversion[];
  unavailable: string[];
};
export function measurementMessage(
  conversions: Conversion[],
  unavailable: string[],
) {
  if (unavailable.includes("conversions"))
    return "No se pudo consultar la configuración de conversiones. No podemos evaluar la medición.";
  const active = conversions.filter((c) => c.status === "ENABLED");
  if (!active.length)
    return "No se encontraron acciones de conversión habilitadas en esta cuenta. Revisa la configuración de medición y si las conversiones se administran desde otra cuenta.";
  if (unavailable.includes("conversionMetrics"))
    return "Hay acciones configuradas, pero no pudimos consultar sus resultados. No se muestran como cero.";
  if (!conversions.some((c) => c.allConversions > 0))
    return "Hay acciones configuradas, pero Google no registra conversiones atribuidas en este período. Esto no confirma que las etiquetas funcionen ni que no hayan llegado contactos.";
  return "Google registra conversiones en este período. Son acciones atribuidas a anuncios; no necesariamente personas únicas ni ventas confirmadas.";
}

/** Shift calendar months and clamp days at the end of the destination month. */
export function shiftMonths(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

/** Periods exclude the account's current partial day. Month presets use full calendar months. */
export function reportPeriod(
  params: URLSearchParams,
  timeZone: string,
  now = new Date(),
) {
  const base = periods(30, timeZone, now);
  const mode =
    params.get("period") || (params.get("days") === "7" ? "7" : "30");
  if (mode === "7" || mode === "30") {
    const days = Number(mode);
    return {
      ...periods(days, timeZone, now),
      days,
      mode,
      granularity: "day" as const,
    };
  }
  const months = (
    { "3m": 3, "6m": 6, "12m": 12, "13m": 13 } as Record<string, number>
  )[mode];
  if (months) {
    const first = new Date(base.monthStart + "T12:00:00Z");
    const monthAt = (offset: number) =>
      new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12),
      )
        .toISOString()
        .slice(0, 10);
    const start = monthAt(-months);
    const end = shiftDate(base.monthStart, -1);
    const previousStart = monthAt(-2 * months);
    const previousEnd = shiftDate(start, -1);
    const days =
      Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    return {
      ...base,
      start,
      end,
      previousStart,
      previousEnd,
      historyStart: previousStart,
      days,
      mode,
      granularity: "month" as const,
    };
  }
  if (mode !== "custom") throw new Error("Período no válido.");
  const start = params.get("start") || "";
  const end = params.get("end") || "";
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v + "T12:00:00Z")) &&
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
  if (!valid(start) || !valid(end) || start > end || end >= base.today)
    throw new Error(
      "Selecciona fechas válidas hasta ayer, con inicio anterior al final.",
    );
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(start, -days);
  if (
    end >= shiftMonths(start, 13) ||
    start < shiftMonths(base.today, -24) ||
    previousStart < shiftMonths(base.today, -37)
  )
    throw new Error(
      "Elige hasta 13 meses dentro de los últimos 24 meses; el período anterior debe estar disponible para su comparación.",
    );
  return {
    ...base,
    start,
    end,
    previousStart,
    previousEnd,
    historyStart: previousStart,
    days,
    mode,
    granularity: days > 62 ? ("month" as const) : ("day" as const),
  };
}

/** Aggregate only the requested days, retaining partial first/last months. */
export function chartByMonth<T extends Metrics & { date: string }>(daily: T[]) {
  const byMonth = new Map<string, Metrics>();
  for (const row of daily) {
    const month = row.date.slice(0, 7);
    byMonth.set(month, sum([byMonth.get(month) || zero(), row]));
  }
  return [...byMonth].map(([date, values]) => ({ date, ...values }));
}
