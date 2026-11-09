"use client";
import { useEffect, useState } from "react";
import { FlaskConical, Plus, ArrowRight, Users, Link2 } from "lucide-react";
import Logout from "../logout";
type Data = {
  clients: {
    id: string;
    name: string;
    status: string;
    customer_id: string | null;
    account_name: string | null;
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    clients: string[];
  }[];
  invitations: {
    id: string;
    email: string;
    client_id: string;
    expires_at: string;
  }[];
};
export default function AdminPanel({ email }: { email: string }) {
  const [data, setData] = useState<Data | null>(null),
    [name, setName] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [client, setClient] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState("");
  async function load() {
    const r = await fetch("/api/admin");
    if (r.status === 401) {
      window.location.assign("/login");
      return;
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    setClient(
      (old) =>
        old ||
        d.clients.find((c: Data["clients"][number]) => c.status === "active")
          ?.id ||
        "",
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) setLink(d.url);
      if (body.action === "create-client") {
        setName("");
        setClient(d.id);
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <header className="admin-header">
        <a className="brand" href="/admin">
          <span className="brand-icon">
            <FlaskConical size={24} />
          </span>
          <span>
            Agencia<span className="brand-light">Labs</span>
            <small>ADMINISTRACIÓN</small>
          </span>
        </a>
        <div>
          <span>{email}</span>
          <Logout />
        </div>
      </header>
      <div className="admin-intro">
        <span className="eyebrow">TU AGENCIA, CONECTADA</span>
        <h1>Clientes y campañas.</h1>
        <p>Organiza los accesos y acompaña los resultados de cada empresa.</p>
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      <div className="admin-grid">
        <section>
          <div className="admin-clients">
            {!data ? (
              <p>Cargando clientes…</p>
            ) : !data.clients.length ? (
              <div className="panel pending-account">
                <Users size={32} />
                <h2>Tu primer cliente empieza aquí.</h2>
                <p>
                  Crea su espacio, conecta Google Ads y comparte una invitación
                  para que pueda consultar sus resultados.
                </p>
              </div>
            ) : (
              data.clients.map((c) => (
                <article className="panel client-card" key={c.id}>
                  <div>
                    <span
                      className={`status-pill ${c.status === "active" ? "enabled" : "paused"}`}
                    >
                      {c.status === "active" ? "Activo" : "Suspendido"}
                    </span>
                    <h2>{c.name}</h2>
                    <p>
                      {c.customer_id
                        ? `Google Ads · ${c.customer_id} · ${c.account_name}`
                        : "Google Ads pendiente de conexión"}
                    </p>
                  </div>
                  <div className="client-actions">
                    {c.status === "active" && (
                      <a className="button primary" href={"/?clientId=" + c.id}>
                        Abrir cliente
                        <ArrowRight size={15} />
                      </a>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        action({
                          action: "client-status",
                          clientId: c.id,
                          status:
                            c.status === "active" ? "suspended" : "active",
                        })
                      }
                    >
                      {c.status === "active" ? "Suspender acceso" : "Reactivar"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <aside className="panel">
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action({ action: "create-client", name });
            }}
          >
            <h2>Crear un cliente</h2>
            <label htmlFor="client-name">Nombre de la empresa</label>
            <input
              id="client-name"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Eticsa"
            />
            <button className="button primary" disabled={busy}>
              <Plus size={16} />
              Crear espacio
            </button>
          </form>
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              setLink("");
              void action({
                action: "invite",
                clientId: client,
                email: inviteEmail,
              });
            }}
          >
            <h2>Invitar a un usuario</h2>
            <label htmlFor="invite-client">Cliente</label>
            <select
              id="invite-client"
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">Selecciona un cliente</option>
              {data?.clients
                .filter((c) => c.status === "active")
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <label htmlFor="invite-email">Correo del usuario</label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="button primary" disabled={busy || !client}>
              <Link2 size={16} />
              Crear invitación
            </button>
            <small>
              El usuario elegirá su contraseña. El enlace vence en 48 horas y
              permite activar el acceso una sola vez.
            </small>
            {link && (
              <div className="invite-result" role="status">
                <strong>Invitación creada</strong>
                <p>
                  Compártela únicamente con la persona invitada. No se ha
                  enviado un correo.
                </p>
                <input
                  aria-label="Enlace de invitación"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(link)
                      .catch(() =>
                        setError("Selecciona y copia el enlace manualmente."),
                      )
                  }
                >
                  Copiar enlace
                </button>
              </div>
            )}
          </form>
        </aside>
      </div>
      <section className="panel admin-section">
        <div className="panel-heading">
          <div>
            <h2>Usuarios de clientes</h2>
            <p>Los accesos suspendidos dejan de funcionar inmediatamente.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Empresas</th>
                <th>Acceso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <br />
                    <small>{u.email}</small>
                  </td>
                  <td>
                    {u.clients
                      .map(
                        (id) =>
                          data.clients.find((c) => c.id === id)?.name || id,
                      )
                      .join(", ")}
                  </td>
                  <td>{u.disabled ? "Suspendido" : "Activo"}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        action({
                          action: "user-status",
                          userId: u.id,
                          disabled: !u.disabled,
                        })
                      }
                    >
                      {u.disabled ? "Reactivar" : "Suspender"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.users.length && (
            <p className="insight-empty">
              Los usuarios aparecerán aquí cuando acepten su invitación.
            </p>
          )}
        </div>
      </section>
      {!!data?.invitations.length && (
        <section className="panel admin-section">
          <div className="panel-heading">
            <h2>Invitaciones pendientes</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Cliente</th>
                  <th>Vence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.invitations.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>
                      {data.clients.find((c) => c.id === i.client_id)?.name}
                    </td>
                    <td>{new Date(i.expires_at).toLocaleString("es-CL")}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          action({ action: "revoke-invitation", id: i.id })
                        }
                      >
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
