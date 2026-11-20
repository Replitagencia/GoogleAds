import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { demoReport } from "../lib/demo";
import { saveWeeklyPdf } from "../lib/weekly-pdf";

test("el informe solo acepta resultados reales del período y crea seis páginas", async () => {
  const report = demoReport(7);
  assert.throws(
    () => saveWeeklyPdf(report, "Cliente de prueba"),
    /resultados reales del período/,
  );
  report.source = "google";
  report.scopeLabel = "Busqueda de prueba + Pmax de prueba";
  report.fetchedAt = "2026-11-08T12:00:00Z";
  const previousDir = process.cwd();
  const dir = await mkdtemp(path.join(tmpdir(), "agencialabs-pdf-test-"));
  try {
    process.chdir(dir);
    saveWeeklyPdf(report, "Cliente de prueba");
    const period = report.insights!.period;
    const pdf = await readFile(
      path.join(dir, `Reporte-Google-Ads-${period.start}-${period.end}.pdf`),
    );
    const content = pdf.toString("latin1");
    assert.ok(content.startsWith("%PDF-"));
    assert.equal((content.match(/\/Type \/Page\b/g) || []).length, 6);
    assert.match(content, /Cliente de prueba/i);
    assert.match(content, /Impresiones/);
    assert.match(content, /Busqueda de prueba \+ Pmax de prueba/);
    assert.match(content, /Búsquedas|B.squedas/);
    assert.doesNotMatch(content, /ETICSA/);
  } finally {
    process.chdir(previousDir);
    await rm(dir, { recursive: true, force: true });
  }
});

test("el PDF de Eticsa agrega una página histórica sin inventar meses sin datos", async () => {
  const report = demoReport(7);
  report.source = "google";
  report.scopeLabel = "Busqueda de prueba + Pmax de prueba";
  report.fetchedAt = "2026-11-20T12:00:00Z";
  report.monthlyHistory = {
    status: "available",
    start: "2025-11-01",
    end: "2026-11-19",
    currentMonth: "2026-11",
    months: Array.from({ length: 13 }, (_, i) => {
      const date = new Date(Date.UTC(2025, 10 + i, 1))
        .toISOString()
        .slice(0, 7);
      return {
        month: date,
        impressions: i === 2 ? null : i * 100,
        clicks: i === 2 ? null : i * 10,
      };
    }),
  };
  const dir = await mkdtemp(path.join(tmpdir(), "agencialabs-history-test-"));
  const old = process.cwd();
  try {
    const logo = await readFile(
      path.join(old, "public/client-logos/eticsa.png"),
    );
    process.chdir(dir);
    saveWeeklyPdf(report, "Eticsa", logo);
    const period = report.insights!.period;
    const pdf = await readFile(
      path.join(dir, `Reporte-Google-Ads-${period.start}-${period.end}.pdf`),
    );
    const content = pdf.toString("latin1");
    assert.equal((content.match(/\/Type \/Page\b/g) || []).length, 7);
    assert.match(content, /Impresiones y clics por mes/);
    assert.match(content, /TOTAL DE LA VENTANA/);
    assert.match(content, /estimadas/);
    assert.match(content, /cuenta completa/);
    assert.match(content, /7\.600 impresiones/);
    assert.match(content, /760 clics/);
  } finally {
    process.chdir(old);
    await rm(dir, { recursive: true, force: true });
  }
});
