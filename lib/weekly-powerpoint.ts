import pptxgen from "pptxgenjs";
import { weeklyReportContent, type WeeklyReport } from "./weekly-report";

export async function eticsaPowerPoint(report: WeeklyReport, logo: Buffer) {
  const {
    info,
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
  } = weeklyReportContent(report);
  // The ESM build and CommonJS interop expose the constructor at different depths.
  const Presentation =
    typeof pptxgen === "function"
      ? pptxgen
      : (pptxgen as { default: typeof pptxgen }).default;
  const deck = new Presentation();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "AgenciaLabs";
  deck.title = "Eticsa · Resultados de Google Ads";
  deck.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };
  const navy = "091835",
    blue = "0E3769",
    muted = "475D76",
    green = "42DFA8";
  const image = "image/png;base64," + logo.toString("base64");
  const { totals, previous: before } = info;

  function text(
    slide: pptxgen.Slide,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize = 15,
    color = navy,
    bold = false,
  ) {
    slide.addText(value, {
      x,
      y,
      w,
      h,
      fontFace: "Arial",
      fontSize,
      bold,
      color,
      margin: 0,
      lang: "es-CL",
      valign: "middle",
      fit: "shrink",
      breakLine: false,
    });
  }
  function page(title: string, subtitle: string) {
    const slide = deck.addSlide();
    text(slide, title, 0.5, 0.42, 10, 0.53, 28, navy, true);
    text(slide, subtitle, 0.5, 1.03, 10, 0.48, 13, muted);
    slide.addImage({
      data: image,
      x: 10.1,
      y: -0.05,
      w: 3.15,
      h: (3.15 * 829) / 1655,
      altText: "ETICSA · Smart starts here",
    });
    text(slide, "ETICSA  /  REPORTE GOOGLE ADS", 0.5, 7.03, 6, 0.21, 9, muted);
    return slide;
  }
  function table(
    slide: pptxgen.Slide,
    headers: string[],
    rows: string[][],
    colW: number[],
  ) {
    const head = headers.map((t) => ({
      text: t,
      options: { bold: true, color: "FFFFFF", fill: { color: blue } },
    }));
    slide.addTable(
      [head, ...rows.map((row) => row.map((value) => ({ text: value })))],
      {
        x: 0.5,
        y: 1.75,
        w: 12.33,
        colW,
        rowH: rows.length <= 4 ? 0.67 : 0.37,
        fontSize: 13,
        fontFace: "Arial",
        color: navy,
        border: { type: "solid", pt: 0.5, color: "DCE5ED" },
        margin: [0.05, 0.11, 0.05, 0.11],
        valign: "middle",
        autoPage: false,
      },
    );
  }

  const cover = deck.addSlide();
  cover.background = { color: navy };
  cover.addShape(deck.ShapeType.roundRect, {
    x: 0.55,
    y: 0.38,
    w: 3.1,
    h: 1.16,
    rectRadius: 0.08,
    fill: { color: "FFFFFF" },
    line: { transparency: 100 },
  });
  cover.addImage({
    data: image,
    x: 0.06,
    y: -0.13,
    w: 4.1,
    h: (4.1 * 829) / 1655,
    altText: "ETICSA · Smart starts here",
  });
  text(
    cover,
    "Resultados de Google Ads",
    0.7,
    2.08,
    11.7,
    0.8,
    43,
    "FFFFFF",
    true,
  );
  text(cover, current, 0.72, 3.03, 11.8, 0.45, 21, "FFFFFF");
  text(
    cover,
    "Campañas incluidas: " + report.scopeLabel,
    0.72,
    3.67,
    11.8,
    0.45,
    16,
    "BED3E5",
  );
  [
    [number(totals.impressions), "Impresiones"],
    [number(totals.clicks), "Clics"],
    [money(totals.cost), "Inversión · " + (report.currency || "CLP")],
  ].forEach(([value, label], i) => {
    text(cover, value, 0.72 + 4.05 * i, 4.95, 3.8, 0.65, 35, "FFFFFF", true);
    text(cover, label, 0.72 + 4.05 * i, 5.73, 3.8, 0.39, 16, green);
  });
  text(
    cover,
    "Comparación con el " + previous,
    0.72,
    6.78,
    11.8,
    0.3,
    13,
    "BED3E5",
  );

  const summary = page("Desempeño del período", current);
  table(
    summary,
    ["Indicador", "Resultado", "Comparación con el período anterior"],
    [
      [
        "Impresiones",
        number(totals.impressions),
        change(totals.impressions, before.impressions),
      ],
      ["Clics", number(totals.clicks), change(totals.clicks, before.clicks)],
      ["Inversión", money(totals.cost), change(totals.cost, before.cost)],
      [
        "Conversiones atribuidas",
        number(totals.conversions),
        change(totals.conversions, before.conversions),
      ],
    ],
    [2.7, 2, 7.63],
  );

  const comparison = page(
    "Impresiones, clics e inversión",
    "Comparación de dos períodos de siete días completos",
  );
  const comparisonRow = (period: string, m: typeof totals) => [
    period,
    number(m.impressions),
    number(m.clicks),
    ctr(m),
    cpc(m),
    money(m.cost),
  ];
  table(
    comparison,
    ["Período", "Impresiones", "Clics", "CTR", "CPC", "Inversión"],
    [comparisonRow(previous, before), comparisonRow(current, totals)],
    [3.55, 2.1, 1.1, 1.5, 1.7, 2.38],
  );
  text(
    comparison,
    "CTR: porcentaje de impresiones que generaron clics. CPC: costo promedio por clic.",
    0.5,
    5.95,
    12.33,
    0.6,
    14,
    muted,
  );

  const priorClicks = new Map(
    oldTerms.map((t) => [t.label.trim().toLocaleLowerCase("es"), t.clicks]),
  );
  for (const metric of ["impressions", "clicks"] as const) {
    const byClicks = metric === "clicks";
    const slide = page(
      byClicks ? "Búsquedas con más clics" : "Dónde aparecen los anuncios",
      current,
    );
    if (!terms.length || termUnavailable) {
      text(
        slide,
        termUnavailable
          ? "Google Ads no permitió consultar los términos de búsqueda."
          : "No hay términos de búsqueda identificados para este período.",
        0.5,
        2,
        12,
        0.8,
      );
    } else {
      const rows = [...terms]
        .sort((a, b) => b[metric] - a[metric] || b.impressions - a.impressions)
        .slice(0, 10)
        .map((t) => {
          const old = priorClicks.get(t.label.trim().toLocaleLowerCase("es"));
          return [
            t.label,
            byClicks
              ? old === undefined
                ? "—"
                : number(old)
              : number(t.impressions),
            number(t.clicks),
          ];
        });
      table(
        slide,
        byClicks
          ? ["Búsqueda en Google", "Clics anteriores", "Clics actuales"]
          : ["Término de búsqueda", "Impresiones", "Clics"],
        rows,
        [8.25, 2.04, 2.04],
      );
    }
    text(
      slide,
      byClicks
        ? "— indica que la búsqueda no figura en la muestra anterior."
        : "Google Ads muestra una parte de las búsquedas que generaron impresiones y clics.",
      0.5,
      6.42,
      12.3,
      0.36,
      12,
      muted,
    );
  }
  const conclusion = page("Conclusión del período", current);
  const notes = [
    "Impresiones: " + change(totals.impressions, before.impressions),
    "Clics: " + change(totals.clicks, before.clicks),
    "La inversión fue " +
      money(totals.cost) +
      ", con un CTR de " +
      ctr(totals) +
      " y un costo por clic de " +
      cpc(totals) +
      ".",
    "Google Ads atribuyó " +
      number(totals.conversions) +
      " conversiones a las campañas incluidas.",
  ];
  notes.forEach((line, i) =>
    text(conclusion, line, 0.65, 1.85 + i * 0.94, 12, 0.68, 18),
  );

  const history = report.monthlyHistory;
  if (history) {
    const slide = page(
      "Impresiones y clics por mes",
      date(history.start) + " al " + date(history.end),
    );
    if (history.status !== "available" || history.months.length !== 13) {
      text(
        slide,
        "El histórico de Eticsa está temporalmente sin datos. Vuelve a descargar el reporte más tarde.",
        0.5,
        2,
        12,
        0.8,
      );
    } else {
      const month = (s: string) =>
        new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" })
          .format(new Date(s + "-01T12:00:00Z"))
          .replace(".", "") +
        " " +
        s.slice(2, 4) +
        (s === history.currentMonth ? "*" : "");
      for (const [index, metric] of (
        ["impressions", "clicks"] as const
      ).entries()) {
        const x = 0.5 + index * 6.25,
          title = index === 0 ? "Impresiones" : "Clics";
        const rows = history.months.flatMap((m) =>
          m[metric] === null
            ? []
            : [
                {
                  label: month(m.month),
                  value: m[metric],
                  partial: m.month === history.currentMonth,
                },
              ],
        );
        text(slide, title + " por mes", x, 1.59, 6.05, 0.42, 20, blue, true);
        if (rows.length) {
          slide.addChart(
            deck.ChartType.bar,
            [
              {
                name: title,
                labels: rows.map((r) => r.label),
                values: rows.map((r) => r.value),
              },
            ],
            {
              x,
              y: 2.07,
              w: 6.05,
              h: 3.65,
              barDir: "col",
              barGrouping: "clustered",
              showLegend: false,
              showTitle: false,
              chartColors: rows.map((r) => (r.partial ? "36BEC6" : "1056A7")),
              showValue: true,
              dataLabelPosition: "outEnd",
              dataLabelColor: navy,
              dataLabelFormatCode: "#,##0",
              dataLabelFontSize: 8,
              catAxisLabelFontSize: 8,
              catAxisLabelFrequency: "1",
              valAxisHidden: true,
              valAxisMinVal: 0,
              valAxisMaxVal: Math.max(1, ...rows.map((r) => r.value)) * 1.23,
              catGridLine: { style: "none" },
              valGridLine: { style: "none" },
            },
          );
        }
        const missing = history.months
          .filter((m) => m[metric] === null)
          .map((m) => month(m.month));
        text(
          slide,
          rows.length
            ? "Total: " + number(rows.reduce((sum, r) => sum + r.value, 0))
            : "Sin registros",
          x,
          5.79,
          6,
          0.37,
          16,
          blue,
          true,
        );
        if (missing.length)
          text(
            slide,
            "Sin registros: " + missing.join(", "),
            x,
            6.18,
            6,
            0.28,
            10,
            muted,
          );
      }
      const partial = history.end.startsWith(history.currentMonth)
        ? " * Mes parcial hasta el " + date(history.end) + "."
        : "";
      text(
        slide,
        "Hasta octubre de 2026: estimaciones de la lámina. Desde noviembre de 2026: datos de Google Ads de toda la cuenta." +
          partial,
        0.5,
        6.53,
        12.33,
        0.35,
        11,
        muted,
      );
    }
  }
  if (report.agencyNote) {
    const note = report.agencyNote,
      slide = page("Qué hicimos y qué sigue", date(note.day));
    text(slide, note.title, 0.55, 1.75, 12.2, 0.94, 22, blue, true);
    text(slide, note.body, 0.55, 2.83, 12.2, 3.95, 17);
  }
  return (await deck.write({
    outputType: "nodebuffer",
    compression: true,
  })) as Buffer;
}
