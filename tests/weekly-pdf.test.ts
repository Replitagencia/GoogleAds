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
