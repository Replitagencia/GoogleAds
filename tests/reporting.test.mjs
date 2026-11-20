import { test } from "node:test";
import assert from "node:assert/strict";
import { periods, change, sum, measurementMessage } from "../lib/reporting.ts";
test("two equally sized complete periods across a year boundary", () => {
  const p = periods(7, "America/Santiago", new Date("2027-01-04T12:00:00Z"));
  assert.equal(p.start, "2026-12-28");
  assert.equal(p.end, "2027-01-03");
  assert.equal(p.previousStart, "2026-12-21");
  assert.equal(p.previousEnd, "2026-12-27");
  assert.equal(p.elapsedDays, 3);
});
test("account timezone governs month boundary and excludes the partial day", () => {
  const p = periods(30, "America/Santiago", new Date("2026-11-01T01:00:00Z"));
  assert.equal(p.today, "2026-10-31");
  assert.equal(p.month, "2026-10");
  assert.equal(p.end, "2026-10-30");
});
test("month projection handles first day and leap year", () => {
  const p = periods(7, "UTC", new Date("2028-02-01T00:00:00Z"));
  assert.equal(p.elapsedDays, 0);
  assert.equal(p.monthDays, 29);
});
test("comparisons do not manufacture percentages when baseline is zero", () => {
  assert.equal(change(12, 0), null);
  assert.equal(change(0, 10), -100);
  assert.equal(change(150, 100), 50);
});
test("fractional attributed conversions are retained", () => {
  assert.deepEqual(
    sum([
      { cost: 12.25, clicks: 1, impressions: 5, conversions: 0.5 },
      { cost: 4.5, clicks: 2, impressions: 8, conversions: 0.25 },
    ]),
    { cost: 16.75, clicks: 3, impressions: 13, conversions: 0.75 },
  );
});
test("unavailable measurement is distinct from configured actions with zero results", () => {
  const action = {
    id: "1",
    name: "Formulario",
    category: "LEAD",
    status: "ENABLED",
    primary: true,
    conversions: 0,
    allConversions: 0,
  };
  assert.match(measurementMessage([], ["conversions"]), /No se pudo consultar/);
  assert.match(measurementMessage([action], []), /Esto no confirma/);
  assert.match(
    measurementMessage([action], ["conversionMetrics"]),
    /No se muestran como cero/,
  );
});

test("thirteen calendar months exclude the current month and compare thirteen prior months", async () => {
  const { reportPeriod } = await import("../lib/reporting.ts");
  const p = reportPeriod(
    new URLSearchParams("period=13m"),
    "America/Santiago",
    new Date("2026-11-19T12:00:00Z"),
  );
  assert.equal(p.start, "2025-10-01");
  assert.equal(p.end, "2026-10-31");
  assert.equal(p.previousStart, "2024-09-01");
  assert.equal(p.previousEnd, "2025-09-30");
  assert.equal(p.granularity, "month");
});
test("custom range validates dates, supports a leap day and uses a preceding equal-length period", async () => {
  const { reportPeriod } = await import("../lib/reporting.ts");
  const now = new Date("2028-03-05T12:00:00Z");
  const p = reportPeriod(
    new URLSearchParams("period=custom&start=2028-02-28&end=2028-03-01"),
    "UTC",
    now,
  );
  assert.equal(p.days, 3);
  assert.equal(p.previousStart, "2028-02-25");
  assert.equal(p.previousEnd, "2028-02-27");
  for (const value of [
    "period=custom&start=2028-02-30&end=2028-03-01",
    "period=custom&start=2028-03-01&end=2028-03-05",
    "period=custom&start=2027-01-01&end=2028-02-02",
    "period=custom&start=2025-01-01&end=2025-02-01",
    "period=unexpected",
  ])
    assert.throws(() => reportPeriod(new URLSearchParams(value), "UTC", now));
});
test("monthly graph sums selected daily rows and preserves fractional conversions", async () => {
  const { chartByMonth } = await import("../lib/reporting.ts");
  const row = (date, cost, conversions) => ({
    date,
    cost,
    conversions,
    clicks: 1,
    impressions: 2,
  });
  const result = chartByMonth([
    row("2026-01-15", 10, 0.5),
    row("2026-01-31", 2, 0.25),
    row("2026-02-01", 3, 1),
  ]);
  assert.deepEqual(
    result.map((x) => x.date),
    ["2026-01", "2026-02"],
  );
  assert.equal(result[0].cost, 12);
  assert.equal(result[0].conversions, 0.75);
  assert.equal(result[1].clicks, 1);
});
