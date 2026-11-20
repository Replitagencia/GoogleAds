import { jsPDF } from "jspdf";
import type { Report } from "./demo";
import type { Breakdown, Metrics } from "./reporting";

// The executive summary uses seven complete days; optional history uses Google Ads observations.
export function saveWeeklyPdf(
  report: Report,
  clientName: string,
  logo?: Uint8Array,
) {
  if (report.source !== "google" || report.days !== 7 || !report.insights)
    throw new Error("No hay resultados reales del período disponibles.");
  const info = report.insights,
    p = info.period;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [297, 167],
  });
  const blue: [number, number, number] = [14, 55, 105],
    dark: [number, number, number] = [9, 24, 53],
    green: [number, number, number] = [0, 174, 126];
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
  function text(
    s: string,
    x: number,
    y: number,
    size = 10,
    color: [number, number, number] = dark,
    font: "normal" | "bold" = "normal",
  ) {
    pdf.setTextColor(...color);
    pdf.setFont("helvetica", font);
    pdf.setFontSize(size);
    pdf.text(s, x, y);
  }
  function heading(kicker: string, title: string, subtitle: string) {
    pdf.setFillColor(...blue);
    pdf.rect(9, 9, 1.6, 22, "F");
    text(kicker.toUpperCase(), 15, 13, 8, blue, "bold");
    text(title, 15, 22, 21, dark, "bold");
    text(subtitle, 15, 29, 9, [93, 111, 135]);
    text(clientName.toUpperCase().slice(0, 35), 237, 16, 13, blue, "bold");
  }
  function footer(page: number) {
    pdf.setDrawColor(220, 227, 235);
    pdf.line(10, 156, 287, 156);
    text(
      `${clientName.toUpperCase()} / REPORTE GOOGLE ADS`,
      11,
      161,
      7,
      [113, 130, 149],
    );
    text(
      `${page} / ${report.monthlyHistory ? 7 : 6}`,
      278,
      161,
      7,
      [113, 130, 149],
    );
  }
  function banner() {
    pdf.setFillColor(...blue);
    pdf.roundedRect(10, 140, 277, 11, 1.5, 1.5, "F");
    text(
      `${number(info.totals.impressions)} impresiones    |    ${number(info.totals.clicks)} clics    |    ${money(info.totals.cost)}    |    CTR ${ctr(info.totals)}    |    CPC ${cpc(info.totals)}`,
      16,
      147,
      10,
      [255, 255, 255],
      "bold",
    );
  }
  function page(k: string, t: string, s: string, n: number) {
    pdf.addPage();
    heading(k, t, s);
    footer(n);
  }
  function row(y: number, columns: string[], xs: number[], bold = false) {
    pdf.setDrawColor(224, 231, 239);
    pdf.line(12, y + 4, 285, y + 4);
    columns.forEach((v, i) =>
      text(v, xs[i], y, 9, dark, bold ? "bold" : "normal"),
    );
  }
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
  // Cover: a clean rendition of the supplied dark-blue/green report design.
  pdf.setFillColor(...dark);
  pdf.rect(0, 0, 297, 167, "F");
  pdf.setFillColor(...green);
  pdf.rect(12, 47, 1.7, 38, "F");
  text(
    clientName.toUpperCase().slice(0, 45),
    15,
    22,
    20,
    [255, 255, 255],
    "bold",
  );
  text("REPORTE  ·  GOOGLE ADS", 20, 50, 9, [76, 235, 177], "bold");
  text("Resultados de Google Ads", 20, 62, 24, [255, 255, 255], "bold");
  text(
    "Evolución de la inversión, las impresiones, los clics y las búsquedas.",
    20,
    72,
    11,
    [178, 218, 214],
  );
  if (report.scopeLabel)
    text(
      `Campañas incluidas: ${report.scopeLabel}`,
      20,
      81,
      9,
      [214, 229, 240],
    );
  [
    [number(info.totals.impressions), "IMPRESIONES"],
    [number(info.totals.clicks), "CLICS"],
    [money(info.totals.cost), "INVERSIÓN " + (report.currency || "")],
  ].forEach(([value, label], i) => {
    const x = 20 + i * 72;
    pdf.setFillColor(17, 52, 87);
    pdf.roundedRect(x, 96, 66, 24, 2, 2, "F");
    text(value, x + 5, 107, 17, [255, 255, 255], "bold");
    text(label, x + 5, 114, 7, [76, 235, 177], "bold");
  });
  text(
    `Período: ${current}  ·  Comparado con: ${previous}`,
    20,
    137,
    8,
    [214, 229, 240],
  );
  text(
    `Datos consultados: ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: report.timeZone || "America/Santiago" }).format(new Date(report.fetchedAt))}  ·  ${report.timeZone || "America/Santiago"}`,
    20,
    144,
    8,
    [214, 229, 240],
  );
  page(
    "Resumen ejecutivo",
    "Desempeño del período",
    `${current} · Comparado con ${previous}`,
    2,
  );
  const change = (v: number, old: number) =>
    old === 0
      ? v === 0
        ? "Sin variación; ambos períodos registran cero."
        : "Sin porcentaje comparable: el período anterior registró cero."
      : `${v >= old ? "Aumentó" : "Disminuyó"} ${number(Math.abs(((v - old) / old) * 100))} % frente al período anterior.`;
  row(
    48,
    [
      "Impresiones",
      `${number(info.totals.impressions)} impresiones. ${change(info.totals.impressions, info.previous.impressions)}`,
    ],
    [14, 65],
  );
  row(
    65,
    [
      "Clics",
      `${number(info.totals.clicks)} clics. ${change(info.totals.clicks, info.previous.clicks)}`,
    ],
    [14, 65],
  );
  row(
    82,
    [
      "Inversión",
      `${money(info.totals.cost)}. ${change(info.totals.cost, info.previous.cost)}`,
    ],
    [14, 65],
  );
  row(
    99,
    [
      "Conversiones",
      `${number(info.totals.conversions)} conversiones atribuidas registradas por Google Ads.`,
    ],
    [14, 65],
  );
  text(
    "Las impresiones no equivalen a personas únicas y los clics no garantizan visitas completas.",
    14,
    117,
    9,
    [93, 111, 135],
  );
  banner();
  page(
    "Comparación de períodos",
    "Impresiones, clics e inversión",
    `Dos períodos equivalentes de 7 días completos`,
    3,
  );
  pdf.setFillColor(...blue);
  pdf.rect(10, 40, 277, 10, "F");
  [
    ["PERÍODO", 14],
    ["IMPRESIONES", 80],
    ["CLICS", 130],
    ["CTR", 164],
    ["CPC", 194],
    ["INVERSIÓN", 239],
  ].forEach(([t, x]) =>
    text(String(t), Number(x), 46, 8, [255, 255, 255], "bold"),
  );
  const values = (m: Metrics) => [
    number(m.impressions),
    number(m.clicks),
    ctr(m),
    cpc(m),
    money(m.cost),
  ];
  row(60, [previous, ...values(info.previous)], [14, 80, 130, 164, 194, 239]);
  row(
    76,
    [current, ...values(info.totals)],
    [14, 80, 130, 164, 194, 239],
    true,
  );
  text(
    "CTR: clics divididos por impresiones. CPC: inversión dividida por clics.",
    14,
    96,
    9,
    [93, 111, 135],
  );
  banner();
  page(
    "Consultas del período",
    "Dónde aparecen los anuncios",
    `Búsquedas identificadas por Google · ${current}`,
    4,
  );
  pdf.setFillColor(...blue);
  pdf.rect(10, 38, 277, 9, "F");
  text("TÉRMINO DE BÚSQUEDA", 14, 44, 8, [255, 255, 255], "bold");
  text("IMPRESIONES", 210, 44, 8, [255, 255, 255], "bold");
  text("CLICS", 260, 44, 8, [255, 255, 255], "bold");
  if (termUnavailable)
    text(
      "Google Ads no permitió consultar los términos de búsqueda.",
      14,
      60,
      10,
    );
  else if (!terms.length)
    text(
      "No hay términos de búsqueda identificados para este período.",
      14,
      60,
      10,
    );
  else
    terms
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10)
      .forEach((t, i) =>
        row(
          54 + i * 7,
          [
            pdf.splitTextToSize(t.label, 180)[0],
            number(t.impressions),
            number(t.clicks),
          ],
          [14, 210, 260],
        ),
      );
  text(
    "Los términos identificados son una muestra y pueden no representar todas las impresiones o clics.",
    14,
    133,
    8,
    [93, 111, 135],
  );
  banner();
  page(
    "Búsquedas del período",
    "Búsquedas con más clics",
    `Comparación de términos identificados en cada período`,
    5,
  );
  pdf.setFillColor(...blue);
  pdf.rect(10, 38, 277, 9, "F");
  text("BÚSQUEDA EN GOOGLE", 14, 44, 8, [255, 255, 255], "bold");
  text("PERÍODO ANTERIOR", 190, 44, 8, [255, 255, 255], "bold");
  text("PERÍODO ACTUAL", 243, 44, 8, [255, 255, 255], "bold");
  if (termUnavailable)
    text(
      "Google Ads no permitió consultar los términos de búsqueda.",
      14,
      60,
      10,
    );
  else if (!terms.length)
    text(
      "No hay términos de búsqueda identificados para este período.",
      14,
      60,
      10,
    );
  else
    terms
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
      .forEach((t, i) => {
        const old = oldTerms.find(
          (o) =>
            o.label.trim().toLocaleLowerCase("es") ===
            t.label.trim().toLocaleLowerCase("es"),
        );
        row(
          54 + i * 7,
          [
            pdf.splitTextToSize(t.label, 168)[0],
            old ? number(old.clicks) : "—",
            number(t.clicks),
          ],
          [14, 200, 255],
        );
      });
  text(
    "— indica un término no disponible en la muestra anterior; no significa necesariamente cero.",
    14,
    133,
    8,
    [93, 111, 135],
  );
  banner();
  page(
    "Lectura de resultados",
    "Conclusión del período",
    `Resumen basado en los datos disponibles de Google Ads`,
    6,
  );
  const conclusions = [
    `Impresiones: ${change(info.totals.impressions, info.previous.impressions)}`,
    `Clics: ${change(info.totals.clicks, info.previous.clicks)}`,
    `La inversión fue ${money(info.totals.cost)}; el CTR fue ${ctr(info.totals)} y el CPC ${cpc(info.totals)}.`,
    `Google Ads registró ${number(info.totals.conversions)} conversiones atribuidas. Su interpretación depende de la configuración de medición.`,
  ];
  conclusions.forEach((v, i) => {
    const lines = pdf.splitTextToSize(v, 250);
    pdf.setFillColor(...green);
    pdf.circle(15, 48 + i * 18, 1.2, "F");
    pdf.setFontSize(10);
    pdf.setTextColor(...dark);
    pdf.text(lines, 21, 49 + i * 18);
  });
  text(
    "Las conclusiones comerciales, causas y acciones deben ser revisadas por la agencia.",
    14,
    128,
    9,
    [93, 111, 135],
  );
  banner();
  if (report.monthlyHistory) {
    const history = report.monthlyHistory;
    pdf.addPage();
    let logoShown = false;
    if (logo?.length) {
      try {
        pdf.addImage(logo, "PNG", 235, -8, 50, 50);
        logoShown = true;
      } catch {
        /* The report remains available if the logo cannot be loaded. */
      }
    }
    pdf.setFillColor(...blue);
    pdf.rect(9, 9, 1.6, 22, "F");
    text("EVOLUCIÓN · 13 MESES", 15, 13, 8, blue, "bold");
    text("Impresiones y clics por mes", 15, 22, 20, dark, "bold");
    text(
      `Del ${date(history.start)} al ${date(history.end)} · Desde noviembre 2026: Google Ads, cuenta completa.`,
      15,
      29,
      8,
      [75, 94, 119],
    );
    text(
      "Noviembre 2025 a octubre 2026: cifras estimadas según la lámina.",
      15,
      34,
      7.5,
      [75, 94, 119],
    );
    if (!logoShown)
      text(clientName.toUpperCase().slice(0, 35), 242, 16, 12, blue, "bold");
    footer(7);
    if (history.status !== "available" || history.months.length !== 13) {
      text(
        "No fue posible cargar el histórico de Eticsa.",
        15,
        58,
        11,
        dark,
        "bold",
      );
      text(
        "Vuelve a descargar el reporte más tarde.",
        15,
        67,
        10,
        [75, 94, 119],
      );
    } else {
      const turquoise: [number, number, number] = [54, 190, 198];
      const names = [
        "ene",
        "feb",
        "mar",
        "abr",
        "may",
        "jun",
        "jul",
        "ago",
        "sep",
        "oct",
        "nov",
        "dic",
      ];
      const monthLabel = (s: string) =>
        `${names[Number(s.slice(5, 7)) - 1]} ${s.slice(2, 4)}${s === history.currentMonth ? "*" : ""}`;
      function chart(
        x: number,
        title: string,
        metric: "impressions" | "clicks",
      ) {
        const width = 134,
          top = 48,
          base = 124,
          chartHeight = 55;
        pdf.setFillColor(250, 252, 255);
        pdf.roundedRect(x, 39, width, 93, 2, 2, "F");
        pdf.setFillColor(...blue);
        pdf.rect(x, 39, width, 10, "F");
        text(title, x + 4, 46, 11, [255, 255, 255], "bold");
        const max = Math.max(1, ...history.months.map((m) => m[metric] ?? 0));
        const step = (width - 8) / 13;
        for (let i = 0; i < history.months.length; i++) {
          const item = history.months[i],
            value = item[metric];
          const cx = x + 4 + step * (i + 0.5),
            height = value === null ? 0 : (value / max) * chartHeight;
          if (value !== null && value > 0) {
            pdf.setFillColor(
              ...(item.month === history.currentMonth
                ? turquoise
                : ([15, 86, 167] as [number, number, number])),
            );
            pdf.rect(cx - 3, base - height, 6, height, "F");
          }
          const label = value === null ? "—" : number(value);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.5);
          pdf.setTextColor(...dark);
          pdf.text(
            label,
            cx,
            Math.min(base - 2, Math.max(top + 5, base - height - 2)),
            { align: "center" },
          );
          pdf.setFontSize(6.2);
          pdf.setTextColor(75, 94, 119);
          pdf.text(monthLabel(item.month), cx, 129, { align: "center" });
        }
      }
      chart(10, "Impresiones por mes", "impressions");
      chart(153, "Clics por mes", "clicks");
      const totals = history.months.reduce(
        (a, m) => ({
          impressions: a.impressions + (m.impressions ?? 0),
          clicks: a.clicks + (m.clicks ?? 0),
        }),
        { impressions: 0, clicks: 0 },
      );
      pdf.setFillColor(232, 244, 250);
      pdf.roundedRect(10, 136, 277, 12, 1.5, 1.5, "F");
      text(
        `TOTAL DE LA VENTANA: ${number(totals.impressions)} impresiones  ·  ${number(totals.clicks)} clics`,
        15,
        143,
        10,
        blue,
        "bold",
      );
      text(
        history.end.startsWith(history.currentMonth)
          ? `* Mes parcial hasta el ${date(history.end)}. — Sin registros.`
          : "Meses completos. — Sin registros.",
        12,
        153,
        7,
        [75, 94, 119],
      );
    }
  }
  pdf.save(`Reporte-Google-Ads-${p.start}-${p.end}.pdf`);
}
