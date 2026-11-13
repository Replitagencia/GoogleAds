import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCampaignDays,
  mergeCampaignPair,
} from "../lib/consolidated-report";
import { sum } from "../lib/reporting";

test("consolida por fecha únicamente las campañas seleccionadas", () => {
  const row = (
    campaignId: string,
    date: string,
    cost: number,
    clicks: number,
  ) => ({
    campaignId,
    date,
    cost,
    clicks,
    impressions: clicks * 10,
    conversions: clicks / 2,
  });
  const rows = [
    row("search", "2026-11-05", 100, 4),
    row("pmax", "2026-11-05", 30, 2),
    row("search", "2026-11-07", 50, 1),
    row("other", "2026-11-05", 9999, 99),
    row("pmax", "2026-11-04", 90, 2),
  ];
  const days = aggregateCampaignDays(
    rows,
    ["search", "pmax"],
    "2026-11-05",
    "2026-11-07",
  );
  assert.deepEqual(
    days.map((x) => x.date),
    ["2026-11-05", "2026-11-06", "2026-11-07"],
  );
  assert.deepEqual(sum(days), {
    cost: 180,
    clicks: 7,
    impressions: 70,
    conversions: 3.5,
  });
  assert.equal(days[1].clicks, 0);
  const previous = aggregateCampaignDays(
    rows,
    ["search", "pmax"],
    "2026-11-04",
    "2026-11-04",
  );
  assert.equal(sum(previous).cost, 90);
});

test("agrupa Pmax en búsqueda y conserva las demás campañas incluso sin actividad", () => {
  const campaign = (id: string, cost: number) => ({
    id,
    name: id,
    cost,
    clicks: cost,
    impressions: cost * 10,
    conversions: cost / 2,
  });
  const rows = [
    campaign("search", 10),
    campaign("pmax", 4),
    campaign("catalog", 0),
  ];
  const result = mergeCampaignPair(rows, "search", "pmax");
  assert.deepEqual(
    result.map((c) => c.id),
    ["search", "catalog"],
  );
  assert.equal(result[0].cost, 14);
  assert.equal(result[0].conversions, 7);
  assert.equal(result[1].cost, 0);
  assert.deepEqual(mergeCampaignPair(rows, "search", "missing"), rows);
});
