import { getPool } from "@/db";
import { whatsappEvents } from "./ga4-whatsapp";
import { shiftMonths } from "./reporting";
import type { searchAds } from "./google-ads";
import type { Report } from "./demo";

export async function latestSharedNote(
  clientId: string,
  customerId: string,
  zone: string,
): Promise<Report["agencyNote"]> {
  const result = await getPool().query(
    "SELECT title,body,to_char(created_at AT TIME ZONE $3,'YYYY-MM-DD') AS day FROM agency_work_log WHERE client_id=$1 AND shared_customer_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
    [clientId, customerId, zone],
  );
  return result.rows[0] ?? null;
}

export async function eticsaSummary(
  clientId: string,
  customerId: string,
  zone: string,
  end: string,
  currency: string,
  query: (q: string) => ReturnType<typeof searchAds>,
) {
  const start = end.slice(0, 7) + "-01",
    beforeStart = shiftMonths(start, -1),
    beforeEnd = shiftMonths(end, -1);
  const range = (from: string, to: string) =>
    `segments.date BETWEEN '${from}' AND '${to}'`;
  // GAQL does not accept OR in WHERE. Query each exact comparison window.
  const action = "Eticsa (web) Bton_Whatsapp";
  const known = query(
    `SELECT conversion_action.name FROM conversion_action WHERE conversion_action.name = '${action}'`,
  )
    .then((rows) => rows.length > 0)
    .catch(() => false);
  async function values(from: string, to: string) {
    const where = range(from, to);
    const [traffic, wa, configured] = await Promise.all([
      query(
        `SELECT metrics.impressions, metrics.cost_micros, metrics.clicks FROM customer WHERE ${where}`,
      ),
      query(
        `SELECT segments.conversion_action_name, metrics.conversions FROM customer WHERE ${where}`,
      ).catch(() => null),
      known,
    ]);
    const matching = wa?.filter(
      (r) => r.segments?.conversionActionName === action,
    );
    const conversions =
      matching && (configured || matching.length)
        ? matching.reduce((n, r) => n + Number(r.metrics.conversions ?? 0), 0)
        : null;
    const cost = traffic.reduce(
      (n, r) => n + Number(r.metrics.costMicros ?? 0) / 1e6,
      0,
    );
    return {
      cost,
      impressions: traffic.reduce(
        (n, r) => n + Number(r.metrics.impressions ?? 0),
        0,
      ),
      clicks: traffic.reduce((n, r) => n + Number(r.metrics.clicks ?? 0), 0),
      conversions,
      cpa: conversions ? cost / conversions : null,
    };
  }
  const [current, previous, ga4, note] = await Promise.all([
    values(start, end),
    values(beforeStart, beforeEnd),
    whatsappEvents(clientId, start, end).catch(() => null),
    latestSharedNote(clientId, customerId, zone),
  ]);
  return {
    start,
    end,
    beforeStart,
    beforeEnd,
    currency,
    current,
    previous,
    ga4,
    note,
  };
}
export type EticsaSummary = Awaited<ReturnType<typeof eticsaSummary>>;
