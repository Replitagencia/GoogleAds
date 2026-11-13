"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Info,
  Target,
  Wallet,
} from "lucide-react";
import { type Report } from "@/lib/demo";
import {
  change,
  measurementMessage,
  type Breakdown,
  type Metrics,
} from "@/lib/reporting";
const number = (n: number) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(n);
const date = (s: string) => s.split("-").reverse().join("/");
const ratio = (n: number, d: number, m = 1) => (d ? (n / d) * m : null);
const emptyMetrics = { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
export function PerformanceSummary({
  report,
  money,
}: {
  report: Report;
  money: (n: number) => string;
}) {
  const current =
    report.insights?.totals ||
    report.campaigns.reduce(
      (a, c) => ({
        cost: a.cost + c.cost,
        clicks: a.clicks + c.clicks,
        impressions: a.impressions + c.impressions,
        conversions: a.conversions + c.conversions,
      }),
      emptyMetrics,
    );
  const previous = report.insights?.previous;
  const items: {
    title: string;
    value: (m: Metrics) => number | null;
    format: (n: number) => string;
    help: string;
  }[] = [
    {
      title: "Inversión total",
      value: (m) => m.cost,
      format: money,
      help: "Gasto del período",
    },
    {
      title: "Clics",
      value: (m) => m.clicks,
      format: number,
      help: `${number(current.impressions)} impresiones`,
    },
    {
      title: "Conversiones",
      value: (m) => m.conversions,
      format: number,
      help: "Columna Conversiones de Google Ads",
    },
    {
      title: "Costo por conversión",
      value: (m) => ratio(m.cost, m.conversions),
      format: money,
      help: "Inversión / conversiones",
    },
    {
      title: "Costo por clic",
      value: (m) => ratio(m.cost, m.clicks),
      format: money,
      help: "Costo promedio de una visita desde el anuncio",
    },
    {
      title: "CTR",
      value: (m) => ratio(m.clicks, m.impressions, 100),
      format: (n) => number(n) + "%",
      help: "Porcentaje de impresiones que generan clics",
    },
  ];
  return (
    <>
      <section
        className="stats-grid expanded-stats"
        aria-label="Indicadores y comparación de períodos"
      >
        {items.map((item) => {
          const now = item.value(current),
            before = previous ? item.value(previous) : null,
            delta =
              now !== null && before !== null ? change(now, before) : null;
          return (
            <article className="stat-card" key={item.title}>
              <div>
                <span>{item.title}</span>
              </div>
              <strong>{now === null ? "—" : item.format(now)}</strong>
              <div className="comparison">
                {delta !== null ? (
                  <>
                    {delta >= 0 ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}{" "}
                    {delta > 0 ? "+" : ""}
                    {number(delta)}% frente al período anterior
                  </>
                ) : (
                  <>
                    {previous
                      ? before === 0 && now === 0
                        ? "Sin cambio · ambos períodos en cero"
                        : "Sin base comparable"
                      : "Comparación no disponible"}
                  </>
                )}
              </div>
              <small>
                {before !== null ? `Anterior: ${item.format(before)} · ` : ""}
                {item.help}
              </small>
            </article>
          );
        })}
      </section>
      {report.insights && (
        <p className="comparison-period">
          {date(report.insights.period.start)} –{" "}
          {date(report.insights.period.end)} frente a{" "}
          {date(report.insights.period.previousStart)} –{" "}
          {date(report.insights.period.previousEnd)} · Períodos de {report.days}{" "}
          días completos
        </p>
      )}
    </>
  );
}
type Workspace = {
  month: string;
  budget: number | null;
  activities: {
    id: string;
    kind: string;
    title: string;
    body: string;
    createdAt: number;
  }[];
};
const categories: Record<string, string> = {
  GET_DIRECTIONS: "Indicaciones para llegar",
  ENGAGEMENT: "Interacción",
  STORE_VISIT: "Visita a tienda",
  DOWNLOAD: "Descarga",
  ADD_TO_CART: "Agregar al carrito",
  BEGIN_CHECKOUT: "Inicio de compra",
  LEAD: "Contacto",
  SUBMIT_LEAD_FORM: "Formulario",
  PHONE_CALL_LEAD: "Llamada",
  CONTACT: "Contacto",
  REQUEST_QUOTE: "Cotización",
  BOOK_APPOINTMENT: "Reserva",
  QUALIFIED_LEAD: "Contacto calificado",
  CONVERTED_LEAD: "Contacto convertido",
  PURCHASE: "Compra",
  PAGE_VIEW: "Vista de página",
  DEFAULT: "Otra acción",
  UNKNOWN: "Sin categoría disponible",
  SIGNUP: "Registro",
  OUTBOUND_CLICK: "Clic saliente",
};
function BreakdownTable({
  rows,
  unavailable,
  money,
  firstLabel = "Detalle",
}: {
  rows: Breakdown[];
  unavailable: boolean;
  money: (n: number) => string;
  firstLabel?: string;
}) {
  return unavailable ? (
    <p className="insight-empty" role="status">
      No se pudo consultar este desglose. Intenta actualizar en unos minutos.
    </p>
  ) : !rows.length ? (
    <p className="insight-empty">
      Google Ads no devolvió actividad para este desglose en el período
      seleccionado.
    </p>
  ) : (
    <div className="table-scroll">
      <table className="insight-table">
        <thead>
          <tr>
            <th>{firstLabel}</th>
            <th>Inversión</th>
            <th>Clics</th>
            <th>CTR</th>
            <th>Conversiones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.label}</strong>
                {r.detail && (
                  <small>
                    {r.detail
                      .replace(/ · EXACT$/, " · Exacta")
                      .replace(/ · PHRASE$/, " · De frase")
                      .replace(/ · BROAD$/, " · Amplia")}
                  </small>
                )}
              </td>
              <td>{money(r.cost)}</td>
              <td>{number(r.clicks)}</td>
              <td>
                {r.impressions
                  ? number((r.clicks / r.impressions) * 100) + "%"
                  : "—"}
              </td>
              <td>{number(r.conversions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function DashboardInsights({
  report,
  money,
  clientId,
  isAdmin,
}: {
  report: Report;
  money: (n: number) => string;
  clientId: string;
  isAdmin: boolean;
}) {
  const workspaceUrl =
    "/api/workspace?clientId=" + encodeURIComponent(clientId);
  const demo = report.source !== "google",
    insights = report.insights;
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [budgetInput, setBudgetInput] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("devices"),
    [kind, setKind] = useState("done"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  async function loadWorkspace() {
    const r = await fetch(workspaceUrl),
      v = (await r.json()) as Workspace & { error?: string };
    if (!r.ok) throw new Error(v.error || "No se pudo cargar la gestión.");
    setWorkspace(v);
    setBudgetInput(v.budget === null ? "" : String(v.budget));
  }
  useEffect(() => {
    if (!demo) loadWorkspace().catch((e) => setError(e.message));
  }, [demo, report.customerId]);
  async function save(type: "budget" | "activity", e: React.FormEvent) {
    e.preventDefault();
    setBusy(type);
    setError("");
    setMessage("");
    try {
      const data =
        type === "budget"
          ? { type, month: workspace?.month, amount: Number(budgetInput) }
          : { type, kind, title, body };
      const r = await fetch(workspaceUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
        v = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(v.error || "No se pudo guardar.");
      await loadWorkspace();
      if (type === "activity") {
        setTitle("");
        setBody("");
      }
      setMessage(
        type === "budget"
          ? "Presupuesto guardado para este mes."
          : "Gestión registrada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy("");
    }
  }
  if (!insights)
    return (
      <section className="panel insight-empty">
        Conecta Google Ads para consultar comparaciones, medición, ubicaciones,
        búsquedas y anuncios.
      </section>
    );
  const budget = workspace?.budget ?? null,
    spent = insights.monthCost,
    projection = insights.period.elapsedDays
      ? (spent / insights.period.elapsedDays) * insights.period.monthDays
      : null;
  const eticsaWhatsapp = report.customerId === "3213724556";
  const whatsappActions = insights.conversions.filter(
    (c) => c.name.trim().toLowerCase() === "eticsa (web) bton_whatsapp",
  );
  const defs = [
    { id: "devices", title: "Dispositivos", rows: insights.devices },
    { id: "locations", title: "Ubicaciones", rows: insights.locations },
    { id: "keywords", title: "Palabras clave", rows: insights.keywords },
    { id: "terms", title: "Búsquedas", rows: insights.terms },
    { id: "ads", title: "Anuncios", rows: insights.ads },
  ];
  const selected = defs.find((d) => d.id === tab)!;
  return (
    <div className="insights-stack">
      <div className="insight-intro">
        <div>
          <span className="eyebrow">ENTIENDE TUS RESULTADOS</span>
          <h2>Presupuesto, contactos y oportunidades</h2>
        </div>
        <span className="badge">
          {demo ? "Vista de ejemplo" : "Google Ads + gestión de agencia"}
        </span>
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
      <section className="panel budget-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Wallet size={18} /> Presupuesto del mes
            </h2>
            <p>
              {insights.period.month} ·{" "}
              {report.scopeLabel ? "Toda la cuenta de Google Ads · " : ""}
              Inversión publicitaria, sin honorarios
            </p>
          </div>
          <span className="badge">
            Independiente del filtro de {report.days} días
          </span>
        </div>
        <div className="budget-body">
          <div>
            <div className="budget-metrics">
              <div>
                <small>Invertido hasta ayer</small>
                <strong>{money(spent)}</strong>
              </div>
              <div>
                <small>Presupuesto acordado</small>
                <strong>
                  {budget === null ? "Sin definir" : money(budget)}
                </strong>
              </div>
              <div>
                <small>Proyección al cierre</small>
                <strong>{projection === null ? "—" : money(projection)}</strong>
              </div>
            </div>
            {budget !== null && (
              <>
                <div
                  className={`budget-track ${spent > budget ? "over" : ""}`}
                  role="progressbar"
                  aria-label="Presupuesto mensual utilizado"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, (spent / budget) * 100)}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (spent / budget) * 100)}%`,
                    }}
                  />
                </div>
                <p className="budget-caption">
                  {number((spent / budget) * 100)}% utilizado ·{" "}
                  {spent <= budget
                    ? `${money(budget - spent)} disponible`
                    : `${money(spent - budget)} por encima del presupuesto`}
                </p>
              </>
            )}
            <p className="insight-footnote">
              Proyección estimada según el gasto promedio de{" "}
              {insights.period.elapsedDays} días completos; no es un cargo ni un
              límite de Google Ads.{" "}
              {projection === null
                ? "Estará disponible al completar el primer día del mes."
                : ""}
            </p>
          </div>
          {isAdmin && (
            <form onSubmit={(e) => save("budget", e)} className="budget-form">
              <label htmlFor="monthly-budget">
                Presupuesto acordado ({report.currency})
              </label>
              <input
                id="monthly-budget"
                type="number"
                min="1"
                max="1000000000000"
                step="1"
                required
                placeholder="Ingresa el monto mensual"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                disabled={demo || !workspace}
              />
              <button
                className="button primary"
                disabled={demo || !workspace || !!busy}
              >
                {busy === "budget" ? "Guardando…" : "Guardar presupuesto"}
              </button>
              <small>
                Este valor solo organiza el portal. No modifica presupuestos ni
                campañas en Google Ads.
              </small>
            </form>
          )}
        </div>
      </section>
      {eticsaWhatsapp ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Target size={18} /> Conversiones de WhatsApp
              </h2>
              <p>
                Acciones atribuidas a las campañas seleccionadas durante el
                período.
              </p>
            </div>
          </div>
          <div className="conversion-summary">
            {insights.unavailable.includes("conversions") ||
            insights.unavailable.includes("conversionMetrics") ? (
              <span>Datos de conversiones no disponibles en este momento.</span>
            ) : whatsappActions.length === 0 ? (
              <span>
                No se encontró la acción de conversión de WhatsApp en esta
                cuenta.
              </span>
            ) : (
              <span>
                Conversiones atribuidas:{" "}
                <strong>
                  {number(
                    whatsappActions.reduce(
                      (sum, action) => sum + action.conversions,
                      0,
                    ),
                  )}
                </strong>
              </span>
            )}
          </div>
          <p className="insight-footnote padded">
            Un clic en WhatsApp no confirma una conversación y una conversión no
            siempre representa un contacto único.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Target size={18} /> Contactos y medición
              </h2>
              <p>
                Acciones configuradas en la cuenta y resultados{" "}
                {report.scopeLabel
                  ? "de las campañas seleccionadas"
                  : "del período"}
              </p>
            </div>
          </div>
          <div className="measurement-note">
            <Info size={17} />
            <p>
              {measurementMessage(insights.conversions, insights.unavailable)}
            </p>
          </div>
          {!insights.unavailable.includes("conversionMetrics") && (
            <div className="conversion-summary">
              <span>
                Conversiones por acción:{" "}
                <strong>
                  {number(
                    insights.conversions.reduce((n, c) => n + c.conversions, 0),
                  )}
                </strong>
              </span>
              <span>
                Todas las conversiones:{" "}
                <strong>
                  {number(
                    insights.conversions.reduce(
                      (n, c) => n + c.allConversions,
                      0,
                    ),
                  )}
                </strong>
              </span>
            </div>
          )}
          <div className="table-scroll">
            <table className="insight-table">
              <thead>
                <tr>
                  <th>Acción registrada</th>
                  <th>Tipo</th>
                  <th>Configuración</th>
                  <th>Conversiones</th>
                  <th>Todas las conversiones</th>
                </tr>
              </thead>
              <tbody>
                {insights.conversions.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>{categories[c.category] || c.category}</td>
                    <td>
                      {c.status === "UNKNOWN"
                        ? "No disponible"
                        : c.status === "ENABLED"
                          ? c.primary
                            ? "Principal · habilitada"
                            : "Secundaria · habilitada"
                          : "No habilitada"}
                    </td>
                    <td>
                      {insights.unavailable.includes("conversionMetrics")
                        ? "—"
                        : number(c.conversions)}
                    </td>
                    <td>
                      {insights.unavailable.includes("conversionMetrics")
                        ? "—"
                        : number(c.allConversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!insights.conversions.length && (
            <p className="insight-empty">
              {insights.unavailable.includes("conversions")
                ? "Configuración no disponible."
                : "Sin acciones de conversión disponibles."}
            </p>
          )}
          <p className="insight-footnote padded">
            «Todas las conversiones» incluye acciones secundarias. Un clic en
            WhatsApp no confirma una conversación y una conversión no siempre
            representa un contacto único. Ver acciones configuradas no sustituye
            una prueba de sus etiquetas.
          </p>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>¿Qué está generando resultados?</h2>
            <p>
              Explora el origen del tráfico y el rendimiento de tus anuncios
            </p>
          </div>
        </div>
        <div
          className="insight-tabs"
          role="tablist"
          aria-label="Desgloses de Google Ads"
        >
          {defs.map((d) => (
            <button
              key={d.id}
              id={`tab-${d.id}`}
              role="tab"
              aria-selected={tab === d.id}
              aria-controls="insight-results"
              onClick={() => setTab(d.id)}
            >
              {d.title}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="insight-results"
          aria-labelledby={`tab-${tab}`}
        >
          <BreakdownTable
            rows={selected.rows}
            unavailable={insights.unavailable.includes(tab)}
            money={money}
            firstLabel={selected.title}
          />
        </div>
        <p className="insight-footnote padded">
          {tab === "locations"
            ? "Ubicación geográfica de presencia reportada por Google, agrupada por región cuando está disponible. No corresponde a ubicación exacta de personas."
            : tab === "terms"
              ? "Hasta 50 búsquedas con más clics. Google omite algunas búsquedas por privacidad; estos resultados pueden no sumar el total de la cuenta."
              : tab === "keywords"
                ? "Hasta 50 palabras clave con más clics, separadas por campaña y grupo. Este desglose no cubre todos los tipos de campaña."
                : tab === "ads"
                  ? "Hasta 20 anuncios de búsqueda adaptables, ordenados por conversiones y luego clics. Se muestran sus títulos disponibles, no una combinación exacta que haya visto cada usuario."
                  : "Resultados por tipo de dispositivo para el período seleccionado."}
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <ClipboardList size={18} /> Gestiones de AgenciaLabs
            </h2>
            <p>Trabajo realizado, próximos pasos y comentarios del ejecutivo</p>
          </div>
          <span className="badge">Registro manual</span>
        </div>
        <div className="agency-layout">
          <div className="activity-list">
            {!workspace?.activities.length ? (
              <p className="insight-empty">
                Todavía no hay gestiones registradas para esta cuenta.
              </p>
            ) : (
              workspace.activities.map((a) => (
                <article key={a.id} className="activity-item">
                  <span className={`activity-symbol ${a.kind}`}>
                    {a.kind === "done" ? (
                      <CheckCircle2 size={17} />
                    ) : a.kind === "next" ? (
                      <CalendarDays size={17} />
                    ) : (
                      <Info size={17} />
                    )}
                  </span>
                  <div>
                    <small>
                      {a.kind === "done"
                        ? "Realizado"
                        : a.kind === "next"
                          ? "Próximo paso"
                          : "Comentario"}{" "}
                      ·{" "}
                      {new Date(a.createdAt).toLocaleString("es-CL", {
                        timeZone: report.timeZone,
                      })}
                    </small>
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </div>
                </article>
              ))
            )}
          </div>
          {isAdmin && (
            <form
              className="activity-form"
              onSubmit={(e) => save("activity", e)}
            >
              <h3>Registrar una gestión</h3>
              <label htmlFor="activity-kind">Tipo</label>
              <select
                id="activity-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="done">Trabajo realizado</option>
                <option value="next">Próximo paso</option>
                <option value="note">Comentario</option>
              </select>
              <label htmlFor="activity-title">Título</label>
              <input
                id="activity-title"
                maxLength={120}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej.: Revisión de palabras clave"
              />
              <label htmlFor="activity-body">Descripción</label>
              <textarea
                id="activity-body"
                maxLength={2000}
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Explica el cambio o el próximo paso…"
              />
              <button
                className="button primary"
                disabled={demo || !workspace || !!busy}
              >
                {busy === "activity" ? "Guardando…" : "Guardar gestión"}
              </button>
              <small>
                Se guarda en esta cuenta del portal. No envía correos ni
                modifica Google Ads.
              </small>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
