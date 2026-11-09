"use client";
import { useEffect, useState } from "react";
type Ticket = {
  id: string;
  client_id: string;
  client_name: string;
  subject: string;
  status: string;
  assigned_to: string | null;
  assignee_name: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
};
type Message = {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
};
type Agent = { id: string; name: string; email: string };
const statusLabels: Record<string, string> = {
  new: "Nueva",
  in_progress: "En curso",
  waiting_client: "Esperando al cliente",
  resolved: "Resuelta",
  closed: "Cerrada",
};
export default function TicketPanel({
  clientId,
  admin,
}: {
  clientId?: string;
  admin: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [agents, setAgents] = useState<Agent[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [subject, setSubject] = useState(""),
    [description, setDescription] = useState(""),
    [reply, setReply] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const active = tickets.find((t) => t.id === selected);
  async function load() {
    const url = clientId
      ? `/api/tickets?clientId=${encodeURIComponent(clientId)}`
      : "/api/tickets";
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "No se pudieron cargar las solicitudes.");
    setTickets(d.tickets);
    setAgents(d.agents);
  }
  async function loadMessages(id: string) {
    const r = await fetch(`/api/tickets?ticketId=${encodeURIComponent(id)}`);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "No se pudo abrir la solicitud.");
    setMessages(d.messages);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);
  async function open(id: string) {
    setSelected(id);
    setMessages([]);
    setError("");
    try {
      await loadMessages(id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo abrir la solicitud.",
      );
    }
  }
  async function action(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "No se pudo guardar.");
      await load();
      const id = d.id || data.ticketId;
      if (typeof id === "string") {
        setSelected(id);
        await loadMessages(id);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ticket-layout">
      <div className="ticket-sidebar panel">
        <div className="ticket-heading">
          <div>
            <h2>Solicitudes</h2>
            <p>
              {admin
                ? "Conversaciones de tus clientes"
                : "Tus solicitudes y su seguimiento"}
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Actualizar
          </button>
        </div>
        {loading ? (
          <p>Cargando solicitudes…</p>
        ) : tickets.length === 0 ? (
          <p className="ticket-empty">Todavía no hay solicitudes.</p>
        ) : (
          <div className="ticket-list">
            {tickets.map((t) => (
              <button
                key={t.id}
                className={
                  t.id === selected ? "ticket-row active" : "ticket-row"
                }
                onClick={() => open(t.id)}
              >
                <strong>{t.subject}</strong>
                <span>
                  {admin ? `${t.client_name} · ` : ""}
                  {statusLabels[t.status]}
                </span>
                <small>
                  {new Date(t.updated_at).toLocaleDateString("es-CL")}
                </small>
              </button>
            ))}
          </div>
        )}
        {!admin && clientId && (
          <form
            className="ticket-new"
            onSubmit={(e) => {
              e.preventDefault();
              void action({
                action: "create",
                clientId,
                subject,
                message: description,
              }).then((ok) => {
                if (ok) {
                  setSubject("");
                  setDescription("");
                }
              });
            }}
          >
            <h3>Nueva solicitud</h3>
            <label>
              Asunto
              <input
                required
                maxLength={120}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="¿En qué podemos ayudarte?"
              />
            </label>
            <label>
              Descripción
              <textarea
                required
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cuéntanos los detalles"
              />
            </label>
            <button className="button primary" disabled={busy}>
              Crear solicitud
            </button>
          </form>
        )}
      </div>
      <section className="ticket-detail panel">
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {!active ? (
          <div className="ticket-placeholder">
            <h2>Todo en un solo lugar</h2>
            <p>
              Selecciona una solicitud para revisar su conversación.
              {!admin && " También puedes crear una nueva."}
            </p>
          </div>
        ) : (
          <>
            <div className="ticket-heading">
              <div>
                <span className="eyebrow">
                  {admin ? active.client_name : "TU SOLICITUD"}
                </span>
                <h2>{active.subject}</h2>
                <p>
                  Creada por {active.author_name} ·{" "}
                  {new Date(active.created_at).toLocaleDateString("es-CL")}
                </p>
              </div>
              <span className="status-pill enabled">
                {statusLabels[active.status]}
              </span>
            </div>
            {admin && (
              <div className="ticket-controls">
                <label>
                  Estado
                  <select
                    value={active.status}
                    disabled={busy}
                    onChange={(e) =>
                      void action({
                        action: "status",
                        ticketId: active.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {Object.entries(statusLabels).map(([v, label]) => (
                      <option value={v} key={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsable
                  <select
                    value={active.assigned_to || ""}
                    disabled={busy}
                    onChange={(e) =>
                      void action({
                        action: "assign",
                        ticketId: active.id,
                        userId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {agents.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name} · {a.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="ticket-conversation">
              {messages.map((m) => (
                <article key={m.id}>
                  <div>
                    <strong>{m.author_name}</strong>
                    <small>
                      {new Date(m.created_at).toLocaleString("es-CL")}
                    </small>
                  </div>
                  <p>{m.body}</p>
                </article>
              ))}
            </div>
            {active.status !== "closed" ? (
              <form
                className="ticket-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    action: "reply",
                    ticketId: active.id,
                    message: reply,
                  }).then((ok) => {
                    if (ok) setReply("");
                  });
                }}
              >
                <label>
                  Responder
                  <textarea
                    required
                    maxLength={4000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Escribe tu mensaje"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Enviar respuesta
                </button>
              </form>
            ) : (
              <p>Esta solicitud está cerrada.</p>
            )}
            <small>
              Los mensajes quedan guardados aquí; no se envían por correo ni
              WhatsApp.
            </small>
          </>
        )}
      </section>
    </div>
  );
}
