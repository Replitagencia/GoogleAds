"use client";
import { useState } from "react";
import {
  House,
  ChartNoAxesColumn,
  FileText,
  MessageCircle,
  MousePointer2,
  Eye,
  ArrowRight,
  ChevronDown,
  Download,
} from "lucide-react";
import { useEticsaResults } from "./eticsa-results";
import EticsaMonthly from "./eticsa-monthly";
import Logout from "./logout";
import BrandCopyright from "@/components/brand-copyright";
import css from "./eticsa-mobile.module.css";

const date = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const num = (n: number | null) =>
  n === null
    ? "Sin datos"
    : n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const tabs = [
  ["Resumen", House],
  ["Evolución", ChartNoAxesColumn],
  ["Reporte", FileText],
] as const;
type Tab = (typeof tabs)[number][0];

export default function EticsaMobile({
  clientId,
  previewMode,
  isAdmin,
  pdfBusy,
  error,
  download,
  detail,
}: {
  clientId: string;
  previewMode: boolean;
  isAdmin: boolean;
  pdfBusy: boolean;
  error: string;
  download: () => void;
  detail: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Resumen");
  const { data, failed, retry } = useEticsaResults(clientId);
  const money = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: data?.currency || "CLP",
          maximumFractionDigits: 0,
        }).format(n);
  function go(t: Tab) {
    setTab(t);
    window.scrollTo(0, 0);
  }
  return (
    <main className={css.app}>
      <header className={css.top}>
        <img src="/branding/agencialabs.jpg" alt="AgenciaLabs" />
        <details>
          <summary>
            Eticsa <ChevronDown size={14} />
          </summary>
          <div className={css.menu}>
            <button onClick={detail}>Panel detallado</button>
            <a href={"/tickets?clientId=" + encodeURIComponent(clientId)}>
              Solicitudes
            </a>
            <a href={previewMode || isAdmin ? "/admin" : "/"}>
              {previewMode || isAdmin ? "Administración" : "Mis empresas"}
            </a>
            {!previewMode && <Logout />}
          </div>
        </details>
      </header>
      {tab === "Resumen" && (
        <>
          <h1>Resumen del mes</h1>
          {failed && (
            <p role="alert">
              No se pudo actualizar el resumen.{" "}
              <button onClick={retry}>Reintentar</button>
            </p>
          )}
          {!failed && !data && <p role="status">Cargando resultados…</p>}
          {data && (
            <>
              <p className={css.period}>
                {date(data.start)} al {date(data.end)} · Cuenta completa
              </p>
              <section className={css.hero}>
                <h2>
                  <MessageCircle size={18} />
                  Conversiones de WhatsApp
                </h2>
                <strong className={css.big}>
                  {num(data.current.conversions)}
                </strong>
                <small>
                  Atribuidas por Google Ads · Anterior:{" "}
                  {num(data.previous.conversions)}
                </small>
                <div className={css.kpis}>
                  <div>
                    Inversión total<b>{money(data.current.cost)}</b>
                  </div>
                  <div>
                    Costo por conversión<b>{money(data.current.cpa)}</b>
                  </div>
                </div>
              </section>
              <div className={css.section}>
                <h2>Rendimiento</h2>
                <button onClick={() => go("Evolución")}>
                  Ver evolución <ArrowRight size={14} />
                </button>
              </div>
              <div className={css.card}>
                <div className={css.entry}>
                  <i>
                    <MousePointer2 />
                  </i>
                  <div>
                    <h3>Clics en anuncios</h3>
                    <small>Anterior: {num(data.previous.clicks)} clics</small>
                  </div>
                  <b>{num(data.current.clicks)}</b>
                </div>
                <div className={css.entry}>
                  <i>
                    <Eye />
                  </i>
                  <div>
                    <h3>Impresiones</h3>
                    <small>Veces que se mostró un anuncio</small>
                  </div>
                  <b>{num(data.current.impressions)}</b>
                </div>
              </div>
              <div className={css.section}>
                <h2>Actividad del sitio</h2>
              </div>
              <div className={css.card}>
                <div className={css.entry}>
                  <i className={css.green}>
                    <MessageCircle />
                  </i>
                  <div>
                    <h3>Clics al botón WhatsApp</h3>
                    <small>GA4 · Todos los canales</small>
                  </div>
                  <b>{num(data.ga4)}</b>
                </div>
              </div>
              {data.note && (
                <section className={css.note}>
                  <h2>Qué hicimos y qué sigue</h2>
                  <small>{date(data.note.day)} · AgenciaLabs</small>
                  <h3>{data.note.title}</h3>
                  <p>{data.note.body}</p>
                </section>
              )}
              <p className={css.foot}>
                Comparación con el {date(data.beforeStart)} al{" "}
                {date(data.beforeEnd)}. Importes en {data.currency}.
              </p>
            </>
          )}
        </>
      )}
      {tab === "Evolución" && (
        <>
          <h1>Evolución</h1>
          <EticsaMonthly compact clientId={clientId} />
        </>
      )}
      {tab === "Reporte" && (
        <>
          <h1>Informe de Eticsa</h1>
          <p className={css.period}>Google Ads · PDF</p>
          <section className={css.note}>
            <h2>Reporte de campañas</h2>
            <p>
              Resultados de los últimos siete días completos e histórico mensual
              de impresiones y clics.
            </p>
            <button
              className={css.download}
              onClick={download}
              disabled={pdfBusy}
            >
              <Download size={17} />
              {pdfBusy ? "Preparando PDF…" : "Descargar reporte PDF"}
            </button>
            {error && <p role="alert">{error}</p>}
          </section>
        </>
      )}
      <footer className={css.foot}>
        <BrandCopyright />
      </footer>
      <nav className={css.nav} aria-label="Navegación móvil de Eticsa">
        {tabs.map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => go(t)}
            aria-current={tab === t ? "page" : undefined}
          >
            <Icon size={20} />
            {t}
          </button>
        ))}
      </nav>
    </main>
  );
}
