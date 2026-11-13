"use client";
import { useEffect, useState } from "react";
type Status = {
  connected: boolean;
  propertyId: string | null;
  propertyName: string | null;
};
type Report = {
  connected: boolean;
  propertyName: string;
  period: { start: string; end: string };
  timeZone: string;
  metrics: {
    sessions: number;
    users: number;
    engagedSessions: number;
    keyEvents: number;
  };
  error?: string;
};
export default function AnalyticsPanel({
  clientId,
  isAdmin,
  days,
  settings = false,
}: {
  clientId: string;
  isAdmin: boolean;
  days: number;
  settings?: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [id, setId] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const api = (path: string) =>
    `${path}${path.includes("?") ? "&" : "?"}clientId=${encodeURIComponent(clientId)}`;
  async function refresh() {
    const r = await fetch(api("/api/ga4/status"));
    if (!r.ok) throw new Error("No se pudo consultar la conexión GA4.");
    const s = (await r.json()) as Status;
    setStatus(s);
    setId(s.propertyId || "");
    return s;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [clientId]);
  useEffect(() => {
    if (settings || !status?.propertyId) return;
    setError("");
    fetch(api(`/api/ga4/report?days=${days}`))
      .then(async (r) => {
        const data = (await r.json()) as Report;
        if (!r.ok)
          throw new Error(
            data.error || "No se pudieron cargar los datos de Analytics.",
          );
        setReport(data);
      })
      .catch((e) => {
        setReport(null);
        setError(e.message);
      });
  }, [status?.propertyId, days, settings]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await fetch(api("/api/ga4/property"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "No se pudo conectar la propiedad.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar.");
    } finally {
      setSaving(false);
    }
  }
  if (settings) {
    if (!isAdmin) return null;
    return (
      <section className="panel connection-card">
        <span className="integration-tag">CONEXIÓN INDEPENDIENTE</span>
        <h2>Google Analytics 4</h2>
        <p>
          Conecta una propiedad por cliente para consultar resultados del sitio
          con acceso de solo lectura.
        </p>
        <div className="connection-state">
          {status?.propertyId
            ? `Conectado · ${status.propertyName} (${status.propertyId})`
            : status?.connected
              ? "Google autorizado · falta seleccionar propiedad"
              : "Pendiente de autorización"}
        </div>
        <a className="button secondary" href={api("/api/ga4/connect")}>
          {status?.connected
            ? "Volver a autorizar GA4"
            : "Conectar Google Analytics"}
        </a>
        {status?.connected && (
          <form onSubmit={save} className="account-form">
            <label htmlFor="ga4-property">
              ID numérico de la propiedad GA4
            </label>
            <input
              id="ga4-property"
              inputMode="numeric"
              pattern="[0-9]{4,16}"
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Ej.: 123456789"
            />
            <button className="button primary" disabled={saving}>
              {saving ? "Verificando…" : "Verificar y guardar propiedad"}
            </button>
            <small>
              Usa el ID de propiedad, no el identificador de medición G-…
            </small>
          </form>
        )}
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }
  if (!status?.propertyId) return null;
  return (
    <section className="panel ga4-panel">
      <div className="panel-heading">
        <div>
          <h2>Visitas al sitio · Google Analytics 4</h2>
          <p>
            Todos los canales de la propiedad {status.propertyName}. No equivale
            solo al tráfico de Google Ads.
          </p>
        </div>
      </div>
      {error ? (
        <p className="insight-empty" role="alert">
          {error}
        </p>
      ) : !report ? (
        <p className="insight-empty">Consultando Google Analytics…</p>
      ) : (
        <>
          <div className="budget-metrics ga4-metrics">
            <div>
              <small>Sesiones</small>
              <strong>{report.metrics.sessions.toLocaleString("es-CL")}</strong>
            </div>
            <div>
              <small>Usuarios</small>
              <strong>{report.metrics.users.toLocaleString("es-CL")}</strong>
            </div>
            <div>
              <small>Sesiones con interacción</small>
              <strong>
                {report.metrics.engagedSessions.toLocaleString("es-CL")}
              </strong>
            </div>
            <div>
              <small>Eventos clave</small>
              <strong>
                {report.metrics.keyEvents.toLocaleString("es-CL")}
              </strong>
            </div>
          </div>
          <p className="insight-footnote padded">
            {report.period.start} al {report.period.end} · {report.timeZone}.
            Los eventos clave dependen de la configuración de GA4 y no siempre
            son contactos o ventas.
          </p>
        </>
      )}
    </section>
  );
}
