"use client";
import { useEffect, useState } from "react";
import type { EticsaSummary } from "@/lib/eticsa-summary";
import { change } from "@/lib/reporting";
import css from "./eticsa-results.module.css";

const num = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const date = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const metrics = [
  ["cost", "Inversión en anuncios"],
  ["clicks", "Clics en anuncios"],
  ["conversions", "Conversiones de WhatsApp atribuidas"],
  ["cpa", "Costo por conversión de WhatsApp"],
] as const;
export default function EticsaResults({ clientId }: { clientId: string }) {
  const [data, setData] = useState<EticsaSummary | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          "/api/report/eticsa?view=summary&clientId=" +
            encodeURIComponent(clientId),
          { signal: controller.signal },
        );
        if (!response.ok) throw Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          setData(result);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    const timer = setInterval(load, 300000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [clientId, attempt]);
  const money = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: data?.currency || "CLP",
    maximumFractionDigits: 0,
  });
  return (
    <section aria-labelledby="month-results-title" className={css.summary}>
      <header>
        <small>ETICSA · GOOGLE ADS · CUENTA COMPLETA</small>
        <h2 id="month-results-title">Resultados del mes</h2>
        {data && (
          <p>
            {date(data.start)} al {date(data.end)}
          </p>
        )}
      </header>
      {failed && (
        <p role="status">
          No se pudo actualizar el resumen.{" "}
          <button
            type="button"
            className="button secondary"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {!data && !failed && <p role="status">Consultando resultados…</p>}
      {data && (
        <div className={css.body}>
          <h3>Rendimiento de las campañas</h3>
          <p>
            Comparación con el {date(data.beforeStart)} al{" "}
            {date(data.beforeEnd)}.
          </p>
          <div className={css.metrics}>
            {metrics.map(([key, label]) => {
              const current = data.current[key],
                previous = data.previous[key],
                delta =
                  current !== null && previous !== null
                    ? change(current, previous)
                    : null;
              const format = (v: number | null) =>
                v === null
                  ? "—"
                  : (key === "cpa" || key === "cost" ? money : num).format(v);
              return (
                <div
                  className={css.metric}
                  key={key}
                  data-focus={key === "conversions"}
                >
                  <h4>{label}</h4>
                  <strong>{format(current)}</strong>
                  <span>
                    {delta !== null
                      ? (delta > 0 ? "↑ " : delta < 0 ? "↓ " : "") +
                        num.format(Math.abs(delta)) +
                        " %"
                      : "Sin base comparable"}
                  </span>
                  <small>Anterior: {format(previous)}</small>
                </div>
              );
            })}
          </div>
          <div className={css.ga}>
            <strong>
              {data.ga4 === null
                ? "Sin datos"
                : num.format(data.ga4) + " clics"}
            </strong>
            <div>
              <b>Botón de WhatsApp del sitio · GA4</b>
              <p>
                Incluye todos los canales. Un clic indica que se pulsó el botón.
                Para confirmar una conversación hay que revisar WhatsApp.
              </p>
            </div>
          </div>
          {data.note ? (
            <aside>
              <h3>Qué hicimos y qué sigue</h3>
              <small>{date(data.note.day)} · AgenciaLabs</small>
              <h4>{data.note.title}</h4>
              <p>{data.note.body}</p>
            </aside>
          ) : (
            <aside>
              <h3>Qué hicimos y qué sigue</h3>
              <p>La agencia aún no ha publicado una gestión en este resumen.</p>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
