"use client";
import { useEffect, useState, useRef } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  FlaskConical,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  MessageSquare,
  Menu,
  MousePointer2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type Report, type Campaign } from "@/lib/demo";
import { PerformanceSummary, DashboardInsights } from "./insights";
import Logout from "./logout";
type View = "overview" | "campaigns" | "connection";
type Status = {
  ready: boolean;
  connected: boolean;
  customerId?: string;
  accountName?: string;
  email?: string;
  redirectUri?: string;
};
const channels: Record<string, string> = {
  SEARCH: "Búsqueda",
  PERFORMANCE_MAX: "Performance Max",
  DISPLAY: "Display",
  VIDEO: "Video",
  SHOPPING: "Shopping",
};
const num = (n: number) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(n);
function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
export default function Portal({
  clientId,
  clientName,
  isAdmin,
  userEmail,
  previewMode = false,
}: {
  clientId: string;
  clientName: string;
  isAdmin: boolean;
  userEmail: string;
  previewMode?: boolean;
}) {
  const api = (path: string) =>
    path +
    (path.includes("?") ? "&" : "?") +
    "clientId=" +
    encodeURIComponent(clientId);
  const [view, setView] = useState<View>("overview"),
    [days, setDays] = useState(30),
    [status, setStatus] = useState<Status | null>(null),
    [live, setLive] = useState<Report | null>(null),
    [busy, setBusy] = useState(false),
    [pdfBusy, setPdfBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [customer, setCustomer] = useState(""),
    [selected, setSelected] = useState<Campaign | null>(null),
    [menu, setMenu] = useState(false),
    [metric, setMetric] = useState("clicks");
  const requestId = useRef(0);
  const report: Report = live || {
    source: "pending",
    accountName: clientName,
    customerId: "",
    currency: "CLP",
    timeZone: "America/Santiago",
    fetchedAt: "",
    days,
    campaigns: [],
    daily: [],
  };
  const demo = report.source === "demo";
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: report.currency || "CLP",
      maximumFractionDigits: report.currency === "CLP" ? 0 : 2,
    }).format(n);
  const totals =
    report.insights?.totals ||
    report.campaigns.reduce(
      (a, c) => ({
        cost: a.cost + c.cost,
        clicks: a.clicks + c.clicks,
        impressions: a.impressions + c.impressions,
        conversions: a.conversions + c.conversions,
      }),
      { cost: 0, clicks: 0, impressions: 0, conversions: 0 },
    );
  const campaigns = report.campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "ALL" || c.status === filter),
  );
  async function refreshStatus() {
    const r = await fetch(api("/api/google/status"));
    if (r.status === 401) {
      window.location.assign("/login");
      return;
    }
    const data = (await r.json()) as Status & { error?: string };
    if (!r.ok)
      throw new Error(data.error || "No se pudo comprobar la conexión.");
    setStatus(data);
    setCustomer(data.customerId || "");
    return data as Status;
  }
  async function loadReport() {
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(api(`/api/report?days=${days}`)),
        data = (await r.json()) as Report & { error?: string };
      if (!r.ok) throw new Error(data.error || "No se pudo cargar el reporte.");
      if (id === requestId.current) setLive(data);
    } catch (e) {
      if (id === requestId.current)
        setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function downloadWeeklyPdf() {
    setPdfBusy(true);
    setError("");
    try {
      const response = await fetch(api("/api/report?days=7"));
      const data = (await response.json()) as Report & { error?: string };
      if (!response.ok)
        throw new Error(data.error || "No se pudo consultar el reporte.");
      const { saveWeeklyPdf } = await import("@/lib/weekly-pdf");
      saveWeeklyPdf(data, clientName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (isAdmin && p.get("view") === "connection") setView("connection");
    const messages: Record<string, string> = {
      setup: "Falta configurar Google Cloud para activar la conexión.",
      connected: "Google autorizado. Ahora selecciona la cuenta de campañas.",
      cancelled: "La autorización fue cancelada. Puedes volver a intentarlo.",
      expired: "La autorización venció. Vuelve a conectar la cuenta.",
      failed: "No se pudo completar la autorización de Google.",
    };
    setNotice(messages[p.get("notice") || ""] || "");
    refreshStatus().catch(() =>
      setError(
        "No se pudo comprobar la conexión. Recarga la página para reintentar.",
      ),
    );
  }, []);
  useEffect(() => {
    if (status?.customerId) void loadReport();
  }, [status?.customerId, days]);
  useEffect(() => {
    if (!status?.customerId) return;
    const timer = setInterval(() => {
      if (!document.hidden) void loadReport();
    }, 300000);
    return () => clearInterval(timer);
  }, [status?.customerId, days]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  function navigate(v: View) {
    if (v === "connection" && !isAdmin) return;
    setView(v);
    setMenu(false);
  }
  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(api("/api/google/account"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: customer }),
        }),
        data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error);
      await refreshStatus();
      setNotice("Cuenta validada. Ya puedes consultar tus campañas.");
      setView("overview");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!live) return;
    const esc = (s: unknown) => {
      const value =
        typeof s === "string" && /^[=+@\t\r-]/.test(s) ? "'" + s : String(s);
      return `"${value.replace(/"/g, '""')}"`;
    };
    const rows: unknown[][] = [
      [demo ? "DATOS DE DEMOSTRACIÓN" : "Google Ads", report.accountName],
      [
        "Período",
        report.insights?.period.start || "",
        report.insights?.period.end || "",
      ],
      [
        "Campaña",
        "Estado",
        `Inversión (${report.currency})`,
        "Clics",
        "Impresiones",
        "Conversiones",
        "CPC",
        "CTR (%)",
      ],
      ...campaigns.map((c) => [
        c.name,
        c.status,
        c.cost,
        c.clicks,
        c.impressions,
        c.conversions,
        c.clicks ? c.cost / c.clicks : "",
        c.impressions ? (c.clicks / c.impressions) * 100 : "",
      ]),
    ];
    if (report.insights) {
      rows.push([], ["Comparación", "Actual", "Anterior"]);
      for (const key of [
        "cost",
        "clicks",
        "impressions",
        "conversions",
      ] as const)
        rows.push([
          {
            cost: "Inversión",
            clicks: "Clics",
            impressions: "Impresiones",
            conversions: "Conversiones",
          }[key],
          report.insights.totals[key],
          report.insights.previous[key],
        ]);
      rows.push(
        [],
        [
          "Acción de conversión",
          "Tipo",
          "Conversiones",
          "Todas las conversiones",
        ],
        ...report.insights.conversions.map((c) => [
          c.name,
          c.category,
          report.insights!.unavailable.includes("conversionMetrics")
            ? "No disponible"
            : c.conversions,
          report.insights!.unavailable.includes("conversionMetrics")
            ? "No disponible"
            : c.allConversions,
        ]),
      );
    }
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `AgenciaLabs-${demo ? "DEMO" : "GoogleAds"}-${report.days}dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const range = demo
    ? `${days === 7 ? "1 nov" : "9 oct"} – 7 nov 2026`
    : `Últimos ${report.days} días completos`;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a href="/" className="brand">
          <span className="brand-icon">
            <FlaskConical size={23} />
          </span>
          <span>
            Agencia<span className="brand-light">Labs</span>
            <small>PORTAL DE CLIENTES</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">AL</span>
          <div>
            {clientName}
            <small>Espacio de cliente</small>
          </div>
          <LockKeyhole size={13} />
        </div>
        <div className="nav-caption">TU PUBLICIDAD</div>
        <nav aria-label="Navegación principal">
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            Resumen
            <ChevronRight className="nav-arrow" size={15} />
          </button>
          <button
            className={view === "campaigns" ? "active" : ""}
            onClick={() => navigate("campaigns")}
          >
            <Megaphone size={18} />
            Campañas<span className="nav-count">{report.campaigns.length}</span>
          </button>
          <button
            onClick={downloadWeeklyPdf}
            disabled={pdfBusy || !status?.customerId}
          >
            <ArrowDownToLine size={18} />
            {pdfBusy ? "Preparando PDF…" : "Descargar reporte"}
          </button>
          <button onClick={download}>
            <ArrowDownToLine size={18} />
            Descargar datos CSV
          </button>
          <a
            className="ticket-nav-link"
            href={"/tickets?clientId=" + encodeURIComponent(clientId)}
          >
            <MessageSquare size={18} /> Solicitudes
          </a>
        </nav>
        {isAdmin && (
          <>
            <div className="nav-caption spaced">CONFIGURACIÓN</div>
            <nav>
              <button
                className={view === "connection" ? "active" : ""}
                onClick={() => navigate("connection")}
              >
                <Link2 size={18} />
                Conexión Google Ads
                <span
                  className={`tiny-dot ${status?.customerId ? "green" : ""}`}
                />
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="pilot-card">
            <ShieldCheck size={25} />
            <strong>Tu espacio, tus resultados.</strong>
            <p>Una visión clara de lo que está pasando con tus campañas.</p>
            {isAdmin && (
              <button onClick={() => navigate("connection")}>
                Configurar cuenta
                <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="profile">
            <span className="avatar">AL</span>
            <div>
              AgenciaLabs<small>{userEmail}</small>
            </div>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="overlay"
          onClick={() => setMenu(false)}
          aria-label="Cerrar menú"
        />
      )}
      <main>
        <div className="client-context">
          <a href={isAdmin || previewMode ? "/admin" : "/"}>
            {previewMode
              ? "← Volver a administración"
              : isAdmin
                ? "← Administrar clientes"
                : "Mis empresas"}
          </a>
          <span>
            {previewMode ? `Vista del cliente · ${clientName}` : clientName}
          </span>
          {!previewMode && <Logout />}
        </div>
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <span className="crumb">Portal de clientes</span>
            <ChevronRight size={14} />
            <strong>
              {view === "overview"
                ? "Resumen"
                : view === "campaigns"
                  ? "Campañas"
                  : "Conexión Google Ads"}
            </strong>
          </div>
          <div>
            <span className="private-pill">
              <LockKeyhole size={12} />
              Acceso privado
            </span>
            {isAdmin && (
              <button
                className="icon-button"
                aria-label="Ayuda de conexión"
                onClick={() => navigate("connection")}
              >
                <CircleHelp size={19} />
              </button>
            )}
            <span className="avatar small">AL</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">AGENCIALABS / GOOGLE ADS</div>
              <h1>
                {view === "overview"
                  ? "Tus resultados, en perspectiva."
                  : view === "campaigns"
                    ? "Cada campaña, al detalle."
                    : "Conecta tu próxima oportunidad."}
              </h1>
              <p>
                {view === "overview"
                  ? "Todo lo que necesitas para entender cómo evoluciona tu publicidad."
                  : view === "campaigns"
                    ? "Revisa la inversión y el rendimiento de tus campañas en un solo lugar."
                    : "Vincula tu cuenta de Google Ads y empieza a ver resultados reales."}
              </p>
            </div>
            {view !== "connection" && (
              <button
                className="button secondary export"
                onClick={downloadWeeklyPdf}
                disabled={pdfBusy || !status?.customerId}
              >
                <ArrowDownToLine size={16} />
                {pdfBusy ? "Preparando PDF…" : "Descargar reporte"}
              </button>
            )}
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
              <button aria-label="Cerrar aviso" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && view === "connection" && (
            <div className="message" role="status">
              {notice}
              <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view !== "connection" ? (
            !status?.customerId ? (
              <section className="panel pending-account">
                <Link2 size={32} />
                <h2>
                  {status
                    ? "Tu cuenta está en preparación."
                    : "Cargando tu espacio…"}
                </h2>
                <p>
                  {isAdmin
                    ? "Conecta la cuenta de Google Ads de este cliente para mostrar resultados reales."
                    : "AgenciaLabs está preparando la conexión con tus campañas. Los resultados aparecerán aquí cuando esté lista."}
                </p>
                {isAdmin && status && (
                  <button
                    className="button primary"
                    onClick={() => navigate("connection")}
                  >
                    Conectar Google Ads
                  </button>
                )}
              </section>
            ) : !live && status?.customerId ? (
              <section className="panel insight-empty" role="status">
                {busy
                  ? "Consultando las campañas de tu cuenta…"
                  : "No se pudo cargar el reporte real."}
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={loadReport}
                >
                  Volver a consultar
                </button>
              </section>
            ) : (
              <>
                <div
                  className={`demo-banner ${demo ? "" : "connected-banner"}`}
                >
                  <span className="banner-icon">
                    {demo ? <FlaskConical size={19} /> : <Check size={19} />}
                  </span>
                  <div>
                    <strong>
                      {demo
                        ? "Estás explorando una demostración"
                        : "Datos consultados desde Google Ads"}
                    </strong>
                    <span>
                      {demo
                        ? "Estos resultados son de ejemplo. Conecta tu cuenta para ver tus campañas reales."
                        : "Actualización automática cada 5 minutos mientras el portal está abierto."}
                    </span>
                  </div>
                  {isAdmin && (
                    <button onClick={() => navigate("connection")}>
                      Ver conexión
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                <div className="filters-bar">
                  <div className="account-label">
                    <GoogleMark />
                    <div>
                      <strong>{report.accountName}</strong>
                      <small>
                        {demo
                          ? "Google Ads · Datos de ejemplo"
                          : `Google Ads · ${report.customerId}`}
                      </small>
                    </div>
                  </div>
                  <div className="date-controls">
                    <label className="date-select">
                      <CalendarDays size={16} />
                      <select
                        aria-label="Período del reporte"
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                      >
                        <option value={30}>Últimos 30 días</option>
                        <option value={7}>Últimos 7 días</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <button
                      className="icon-button refresh"
                      disabled={busy || !status?.customerId}
                      onClick={loadReport}
                      aria-label="Actualizar datos de Google Ads"
                      title={
                        status?.customerId
                          ? "Actualizar datos"
                          : "Conecta Google Ads para actualizar"
                      }
                    >
                      <RefreshCw size={17} className={busy ? "spin" : ""} />
                    </button>
                  </div>
                </div>
                {busy && (
                  <div className="loading-line" role="status">
                    Consultando Google Ads…
                  </div>
                )}
                {view === "overview" && (
                  <>
                    <PerformanceSummary report={report} money={money} />
                    <div className="charts-grid">
                      <section className="panel performance">
                        <div className="panel-heading">
                          <div>
                            <h2>Evolución del rendimiento</h2>
                            <p>
                              {range} · {report.timeZone}
                            </p>
                          </div>
                          <div className="segmented">
                            <button
                              className={metric === "clicks" ? "selected" : ""}
                              onClick={() => setMetric("clicks")}
                            >
                              Clics
                            </button>
                            <button
                              className={
                                metric === "conversions" ? "selected" : ""
                              }
                              onClick={() => setMetric("conversions")}
                            >
                              Conversiones
                            </button>
                          </div>
                        </div>
                        <div className="chart-legend">
                          <span />
                          {metric === "clicks" ? "Clics" : "Conversiones"} por
                          día{demo && <em>· Ejemplo</em>}
                        </div>
                        <div className="chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={report.daily}
                              margin={{
                                top: 12,
                                right: 12,
                                left: -23,
                                bottom: 0,
                              }}
                            >
                              <defs>
                                <linearGradient
                                  id="chartFill"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#4f69e8"
                                    stopOpacity={0.2}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#4f69e8"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                stroke="#edf0f5"
                                strokeDasharray="4 4"
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(v) =>
                                  String(v).slice(8) +
                                  "/" +
                                  String(v).slice(5, 7)
                                }
                                axisLine={false}
                                tickLine={false}
                                minTickGap={35}
                                tick={{ fontSize: 11, fill: "#8993a7" }}
                                dy={8}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: "#8993a7" }}
                              />
                              <Tooltip
                                labelFormatter={(v) => `Fecha: ${v}`}
                                formatter={(v) => [
                                  num(Number(v)),
                                  metric === "clicks"
                                    ? "Clics"
                                    : "Conversiones",
                                ]}
                                contentStyle={{
                                  borderRadius: 12,
                                  border: "1px solid #e8ebf1",
                                  fontSize: 12,
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey={metric}
                                stroke="#506be8"
                                strokeWidth={2.5}
                                fill="url(#chartFill)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                      <section className="panel distribution">
                        <div className="panel-heading">
                          <div>
                            <h2>Inversión por campaña</h2>
                            <p>Distribución del gasto</p>
                          </div>
                          <BarChart3 size={18} />
                        </div>
                        <div className="distribution-total">
                          <span>Total invertido</span>
                          <strong>{money(totals.cost)}</strong>
                        </div>
                        <div className="stacked-bar">
                          {report.campaigns.map((c, i) => (
                            <div
                              key={c.id}
                              className={`color-${i % 4}`}
                              style={{
                                width: `${totals.cost ? (c.cost / totals.cost) * 100 : 0}%`,
                              }}
                              title={`${c.name}: ${money(c.cost)}`}
                            />
                          ))}
                        </div>
                        <div className="distribution-list">
                          {report.campaigns.slice(0, 4).map((c, i) => (
                            <div key={c.id}>
                              <span className={`dot color-${i % 4}`} />
                              <span title={c.name}>
                                {c.name.split(" · ")[1] || c.name}
                              </span>
                              <strong>
                                {totals.cost
                                  ? Math.round((c.cost / totals.cost) * 100)
                                  : 0}
                                %
                              </strong>
                            </div>
                          ))}
                        </div>
                        <div className="distribution-foot">
                          <Activity size={14} />
                          {
                            report.campaigns.filter(
                              (c) => c.status === "ENABLED",
                            ).length
                          }{" "}
                          campañas activas de {report.campaigns.length}
                        </div>
                      </section>
                    </div>
                  </>
                )}
                <section className="panel campaign-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {view === "overview"
                          ? "Tus campañas"
                          : "Todas las campañas"}
                        <span className="count">{report.campaigns.length}</span>
                      </h2>
                      <p>Resultados del período seleccionado</p>
                    </div>
                    {view === "overview" ? (
                      <button
                        className="text-button"
                        onClick={() => navigate("campaigns")}
                      >
                        Ver todas
                        <ArrowRight size={15} />
                      </button>
                    ) : (
                      <span className="date-caption">{range}</span>
                    )}
                  </div>
                  <div className="table-toolbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Buscar campaña"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar campaña…"
                      />
                    </label>
                    <label className="status-filter">
                      <Settings2 size={15} />
                      <select
                        aria-label="Filtrar por estado"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="ALL">Todos los estados</option>
                        <option value="ENABLED">Activas</option>
                        <option value="PAUSED">En pausa</option>
                        <option value="REMOVED">Eliminadas</option>
                      </select>
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Campaña</th>
                          <th>Estado</th>
                          <th>Inversión</th>
                          <th>Clics</th>
                          <th>Conversiones</th>
                          <th>Costo / conv.</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <button
                                className="campaign-name"
                                onClick={() => setSelected(c)}
                              >
                                <span
                                  className={`channel-icon ${c.channel === "PERFORMANCE_MAX" ? "purple" : ""}`}
                                >
                                  {c.channel === "SEARCH" ? (
                                    <Search size={16} />
                                  ) : c.channel === "PERFORMANCE_MAX" ? (
                                    <TrendingUp size={16} />
                                  ) : (
                                    <LayoutDashboard size={16} />
                                  )}
                                </span>
                                <span>
                                  {c.name}
                                  <small>
                                    {channels[c.channel] || c.channel}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span
                                className={`status-pill ${c.status === "ENABLED" ? "enabled" : "paused"}`}
                              >
                                <i />
                                {c.status === "ENABLED"
                                  ? "Activa"
                                  : c.status === "PAUSED"
                                    ? "En pausa"
                                    : c.status === "REMOVED"
                                      ? "Eliminada"
                                      : c.status}
                              </span>
                            </td>
                            <td>{money(c.cost)}</td>
                            <td>{num(c.clicks)}</td>
                            <td>{num(c.conversions)}</td>
                            <td>
                              {c.conversions
                                ? money(c.cost / c.conversions)
                                : "—"}
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Ver detalle de ${c.name}`}
                                onClick={() => setSelected(c)}
                              >
                                <ChevronRight size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!campaigns.length && (
                      <div className="empty">
                        No hay campañas para este filtro.
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {campaigns.length} campañas ·{" "}
                      {demo ? "Datos de demostración" : "Fuente: Google Ads"}
                    </span>
                    <span>Moneda: {report.currency}</span>
                  </div>
                </section>
                {view === "overview" && (
                  <DashboardInsights
                    key={report.customerId}
                    report={report}
                    money={money}
                    clientId={clientId}
                    isAdmin={isAdmin}
                  />
                )}
                <div className="bottom-note">
                  <ShieldCheck size={14} />
                  {demo
                    ? "Vista de ejemplo. Aún no hay una cuenta de Google Ads conectada."
                    : `Última consulta: ${new Date(report.fetchedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}. Google puede ajustar los datos posteriormente.`}
                </div>
              </>
            )
          ) : (
            <div className="connection-layout">
              <section className="panel connection-card">
                <div className="connection-logo">
                  <GoogleMark />
                </div>
                <span className="integration-tag">INTEGRACIÓN POR API</span>
                <h2>Google Ads + AgenciaLabs</h2>
                <p>
                  Consulta inversión, clics y conversiones sin salir de tu
                  portal. Esta integración consulta resultados y no incluye
                  acciones para editar campañas.
                </p>
                <div className="connection-state">
                  <span
                    className={`tiny-dot ${status?.customerId ? "green" : ""}`}
                  />
                  {status?.customerId
                    ? `Cuenta conectada · ${status.customerId}`
                    : status?.connected
                      ? "Google autorizado · Falta seleccionar cuenta"
                      : "Pendiente de configuración"}
                </div>
                {status?.ready ? (
                  <a
                    className="button primary"
                    href={api("/api/google/connect")}
                    target="_top"
                  >
                    <GoogleMark />
                    {status.connected
                      ? "Volver a autorizar Google"
                      : "Conectar con Google"}
                    <ArrowRight size={17} />
                  </a>
                ) : (
                  <div className="setup-notice">
                    <LockKeyhole size={17} />
                    <div>
                      <strong>Primero, configura Google Cloud</strong>
                      <span>
                        El botón de autorización se habilitará cuando estén
                        configuradas las credenciales de la aplicación.
                      </span>
                    </div>
                  </div>
                )}
                {status?.connected && (
                  <form onSubmit={saveAccount} className="account-form">
                    <label htmlFor="customer">
                      ID de la cuenta de Google Ads
                    </label>
                    <input
                      id="customer"
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      placeholder="123-456-7890"
                      required
                      pattern="[0-9 -]{10,14}"
                    />
                    <small>
                      Usa la cuenta que contiene tus campañas, no un MCC.
                    </small>
                    <button className="button primary" disabled={busy}>
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                      Validar y guardar cuenta
                    </button>
                  </form>
                )}
                <div className="connection-assurance">
                  <ShieldCheck size={16} />
                  La autorización se realiza en Google. Nunca solicitamos tu
                  contraseña de Google.
                </div>
              </section>
              <section className="panel setup-guide">
                <div className="panel-heading">
                  <div>
                    <h2>Tu primera conexión</h2>
                    <p>Configuración de la cuenta del cliente</p>
                  </div>
                  <span className="badge">4 pasos</span>
                </div>
                <ol>
                  <li>
                    <span>1</span>
                    <div>
                      <h3>Crear el proyecto de Google Cloud</h3>
                      <p>
                        Crea un proyecto para AgenciaLabs, habilita Google Ads
                        API y configura el acceso a la API que Google solicite
                        para tu proyecto.
                      </p>
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir Google Cloud
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <h3>Preparar la autorización de Google</h3>
                      <p>
                        Configura la pantalla de consentimiento OAuth, agrega tu
                        correo como usuario de prueba y crea un cliente de tipo
                        «Aplicación web».
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <h3>Registrar el retorno al portal</h3>
                      <p>
                        Agrega esta dirección exacta como URI de redirección
                        autorizada:
                      </p>
                      <code>
                        {status?.redirectUri ||
                          "https://ads.registroevento.cl/api/google/callback"}
                      </code>
                      <p>
                        El ID y el secreto OAuth se configuran en el servidor.
                        No los guardes en GitHub ni los pegues en el chat.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>4</span>
                    <div>
                      <h3>Autorizar tu cuenta y ver campañas</h3>
                      <p>
                        Conecta con Google, ingresa el ID de tu cuenta de Google
                        Ads y valida el acceso. El panel consultará tus datos
                        automáticamente.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="pilot-info">
                  <FlaskConical size={18} />
                  <p>
                    <strong>
                      Cada cliente tiene una conexión independiente.
                    </strong>{" "}
                    Solo los administradores de AgenciaLabs pueden configurar y
                    cambiar la cuenta de Google Ads asignada.
                  </p>
                </div>
              </section>
            </div>
          )}
          <footer>
            <span>© 2026 AgenciaLabs</span>
            <span>Claridad para tomar mejores decisiones.</span>
          </footer>
        </div>
      </main>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              onClick={() => setSelected(null)}
              aria-label="Cerrar detalle"
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              DETALLE DE CAMPAÑA {demo ? "· DEMOSTRACIÓN" : ""}
            </span>
            <h2 id="campaign-title">{selected.name}</h2>
            <p>
              {channels[selected.channel] || selected.channel} · {range}
            </p>
            <div className="detail-grid">
              {[
                ["Inversión", money(selected.cost)],
                ["Impresiones", num(selected.impressions)],
                ["Clics", num(selected.clicks)],
                [
                  "CTR",
                  `${selected.impressions ? num((selected.clicks / selected.impressions) * 100) : 0}%`,
                ],
                ["Conversiones", num(selected.conversions)],
                [
                  "CPC promedio",
                  selected.clicks
                    ? money(selected.cost / selected.clicks)
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Volver a campañas
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
