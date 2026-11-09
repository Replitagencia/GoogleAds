"use client";
import { useEffect, useRef, useState } from "react";
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
    is_admin: boolean;
    clients: string[];
  }[];
  invitations: {
    id: string;
    email: string;
    client_id: string;
    expires_at: string;
  }[];
  checklist: {
    client_id: string;
    item_key: string;
    title: string;
    position: number;
    completed: boolean;
  }[];
  profiles: {
    client_id: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    responsible: string;
    internal_notes: string;
  }[];
};
function ClientProfile({
  id,
  profile,
  busy,
  save,
}: {
  id: string;
  profile: Data["profiles"][number] | undefined;
  busy: boolean;
  save: (body: Record<string, unknown>) => void;
}) {
  return (
    <details className="client-profile">
      <summary>Ficha y notas internas</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          save({
            action: "save-profile",
            clientId: id,
            contactName: form.get("contactName"),
            contactEmail: form.get("contactEmail"),
            contactPhone: form.get("contactPhone"),
            responsible: form.get("responsible"),
            internalNotes: form.get("internalNotes"),
          });
        }}
      >
        <label>
          Contacto
          <input
            name="contactName"
            maxLength={254}
            defaultValue={profile?.contact_name || ""}
          />
        </label>
        <label>
          Correo de contacto
          <input
            type="email"
            name="contactEmail"
            maxLength={254}
            defaultValue={profile?.contact_email || ""}
          />
        </label>
        <label>
          Teléfono
          <input
            name="contactPhone"
            maxLength={254}
            defaultValue={profile?.contact_phone || ""}
          />
        </label>
        <label>
          Responsable de la agencia
          <input
            name="responsible"
            maxLength={254}
            defaultValue={profile?.responsible || ""}
          />
        </label>
        <label>
          Notas internas
          <textarea
            name="internalNotes"
            maxLength={4000}
            defaultValue={profile?.internal_notes || ""}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Guardar ficha
        </button>
      </form>
    </details>
  );
}
export default function AdminPanel({ email }: { email: string }) {
  const [data, setData] = useState<Data | null>(null),
    [name, setName] = useState(""),
    [newEmail, setNewEmail] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [inviteEmail, setInviteEmail] = useState(""),
    [client, setClient] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [linkEmail, setLinkEmail] = useState(""),
    [linkCompany, setLinkCompany] = useState(""),
    [copied, setCopied] = useState(false);
  const inviteEmailInput = useRef<HTMLInputElement>(null);
  const accessResult = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (link) accessResult.current?.focus();
  }, [link]);
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
    setCopied(false);
    setLink("");
    try {
      const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) {
        setLink(d.url);
        setLinkEmail(String(body.email).trim().toLowerCase());
        setLinkCompany(
          String(
            body.name ||
              data?.clients.find((c) => c.id === body.clientId)?.name ||
              "",
          ),
        );
      }
      if (body.action === "create-client-access") {
        setName("");
        setNewEmail("");
        setClient(d.id);
      }
      await load();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la acción.",
      );
      return false;
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
        <p>
          Este panel es de la agencia. Cada cliente entra directamente a sus
          campañas.
        </p>
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {data && (
        <div className="admin-summary">
          <div>
            <strong>
              {data.clients.filter((c) => c.status === "active").length}
            </strong>
            <span>Clientes activos</span>
          </div>
          <div>
            <strong>
              {
                data.clients.filter(
                  (c) => c.status === "active" && c.customer_id,
                ).length
              }
            </strong>
            <span>Cuentas conectadas</span>
          </div>
          <div>
            <strong>{data.invitations.length}</strong>
            <span>Accesos pendientes</span>
          </div>
          <div>
            <strong>
              {
                data.clients.filter(
                  (c) =>
                    c.status === "active" &&
                    (!c.customer_id ||
                      data.invitations.some((i) => i.client_id === c.id) ||
                      data.checklist.some(
                        (t) => t.client_id === c.id && !t.completed,
                      )),
                ).length
              }
            </strong>
            <span>Clientes por atender</span>
          </div>
        </div>
      )}
      {data && (
        <section
          className="panel admin-alerts"
          aria-label="Atención prioritaria"
        >
          <h2>Atención prioritaria</h2>
          {data.clients
            .filter((c) => c.status === "active" && !c.customer_id)
            .map((c) => (
              <p key={"connection-" + c.id}>
                <strong>{c.name}:</strong> Google Ads pendiente de conexión.{" "}
                <a href={"/?clientId=" + c.id + "&view=connection"}>
                  Configurar cuenta →
                </a>
              </p>
            ))}
          {data.invitations.map((i) => (
            <p key={i.id}>
              <strong>
                {data.clients.find((c) => c.id === i.client_id)?.name}:
              </strong>{" "}
              acceso pendiente para {i.email}.{" "}
              <a href="#pending-access">Ver acceso →</a>
            </p>
          ))}
          {!data.clients.some((c) => c.status === "active" && !c.customer_id) &&
            !data.invitations.length && (
              <p>No hay conexiones ni activaciones pendientes.</p>
            )}
        </section>
      )}
      <div className="admin-filters">
        <input
          aria-label="Buscar clientes"
          placeholder="Buscar cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filtrar clientes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos los clientes</option>
          <option value="pending">Conexión pendiente</option>
          <option value="connected">Conectados</option>
          <option value="suspended">Suspendidos</option>
        </select>
      </div>
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
              data.clients
                .filter(
                  (c) =>
                    c.name
                      .toLowerCase()
                      .includes(search.trim().toLowerCase()) &&
                    (filter === "all" ||
                      (filter === "pending" &&
                        c.status === "active" &&
                        !c.customer_id) ||
                      (filter === "connected" &&
                        c.status === "active" &&
                        !!c.customer_id) ||
                      (filter === "suspended" && c.status === "suspended")),
                )
                .map((c) => (
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
                      <p>
                        Responsable:{" "}
                        {data.profiles.find((p) => p.client_id === c.id)
                          ?.responsible || "Sin asignar"}
                      </p>
                      <p>
                        Usuarios:{" "}
                        {
                          data.users.filter((u) => u.clients.includes(c.id))
                            .length
                        }
                        {" · "}Activaciones pendientes:{" "}
                        {
                          data.invitations.filter((i) => i.client_id === c.id)
                            .length
                        }
                      </p>
                    </div>
                    <div className="client-actions">
                      {c.status === "active" && (
                        <>
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setClient(c.id);
                              setInviteEmail("");
                              setLink("");
                              setError("");
                              inviteEmailInput.current?.focus();
                            }}
                          >
                            Crear acceso de cliente
                          </button>
                          <a
                            className="button primary"
                            href={"/?clientId=" + c.id + "&preview=client"}
                          >
                            Ver como cliente
                            <ArrowRight size={15} />
                          </a>
                          <a
                            className="text-button"
                            href={"/?clientId=" + c.id + "&view=connection"}
                          >
                            Configurar Google Ads
                          </a>
                        </>
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
                        {c.status === "active"
                          ? "Suspender acceso"
                          : "Reactivar"}
                      </button>
                    </div>
                    <details className="client-checklist">
                      <summary>
                        Checklist de inicio ·{" "}
                        {
                          data.checklist.filter(
                            (t) => t.client_id === c.id && t.completed,
                          ).length
                        }
                        /
                        {
                          data.checklist.filter((t) => t.client_id === c.id)
                            .length
                        }{" "}
                        completadas
                      </summary>
                      {data.checklist
                        .filter((t) => t.client_id === c.id)
                        .map((t) => (
                          <label key={t.item_key}>
                            <input
                              type="checkbox"
                              checked={t.completed}
                              disabled={busy}
                              onChange={(e) =>
                                void action({
                                  action: "checklist-status",
                                  clientId: c.id,
                                  itemKey: t.item_key,
                                  completed: e.target.checked,
                                })
                              }
                            />{" "}
                            {t.title}
                          </label>
                        ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const input = e.currentTarget.elements.namedItem(
                            "task",
                          ) as HTMLInputElement;
                          void action({
                            action: "checklist-add",
                            clientId: c.id,
                            title: input.value,
                          }).then((saved) => {
                            if (saved) input.value = "";
                          });
                        }}
                      >
                        <input
                          name="task"
                          required
                          maxLength={200}
                          aria-label={`Nueva tarea para ${c.name}`}
                          placeholder="Agregar tarea al checklist"
                        />
                        <button
                          type="submit"
                          className="text-button"
                          disabled={busy}
                        >
                          Agregar tarea
                        </button>
                      </form>
                    </details>
                    <ClientProfile
                      id={c.id}
                      profile={data.profiles.find((p) => p.client_id === c.id)}
                      busy={busy}
                      save={action}
                    />
                  </article>
                ))
            )}
          </div>
        </section>
        <aside className="panel">
          {link && (
            <div
              className="invite-result"
              role="status"
              tabIndex={-1}
              ref={accessResult}
            >
              <strong>Acceso pendiente de activación</strong>
              <p>
                {linkCompany} · {linkEmail}
              </p>
              <p>
                Comparte este enlace con esa persona. Elegirá su contraseña y
                entrará a sus campañas. Vence en 48 horas. No se ha enviado un
                correo.
              </p>
              <input
                aria-label="Enlace de activación"
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
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Selecciona y copia el enlace manualmente."),
                    )
                }
              >
                {copied ? "Enlace copiado" : "Copiar enlace de activación"}
              </button>
            </div>
          )}
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action({
                action: "create-client-access",
                name,
                email: newEmail,
              });
            }}
          >
            <h2>Nuevo cliente y su acceso</h2>
            <label htmlFor="client-name">Nombre de la empresa</label>
            <input
              id="client-name"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Eticsa"
            />
            <label htmlFor="new-client-email">
              Correo de acceso del cliente
            </label>
            <input
              id="new-client-email"
              type="email"
              required
              maxLength={254}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="cliente@empresa.cl"
            />
            <button className="button primary" disabled={busy}>
              <Plus size={16} />
              Crear cliente y acceso
            </button>
            <small>
              El cliente elegirá su contraseña y solo verá las campañas de su
              empresa.
            </small>
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
            <h2>Dar acceso a un cliente existente</h2>
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
            <label htmlFor="invite-email">Correo de acceso del cliente</label>
            <input
              id="invite-email"
              type="email"
              required
              maxLength={254}
              ref={inviteEmailInput}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="button primary" disabled={busy || !client}>
              <Link2 size={16} />
              Crear acceso
            </button>
            <small>
              El usuario elegirá su contraseña. El enlace vence en 48 horas y
              permite activar el acceso una sola vez.
            </small>
          </form>
        </aside>
      </div>
      <section className="panel admin-section">
        <div className="panel-heading">
          <div>
            <h2>Cuentas de clientes</h2>
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
                  <td>
                    {u.disabled
                      ? "Suspendido"
                      : u.is_admin
                        ? "Administrador de agencia"
                        : "Activo"}
                  </td>
                  <td>
                    {!u.is_admin && (
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.users.length && (
            <p className="insight-empty">
              Las cuentas aparecerán aquí cuando el cliente active su acceso y
              elija su contraseña.
            </p>
          )}
        </div>
      </section>
      {!!data?.invitations.length && (
        <section className="panel admin-section" id="pending-access">
          <div className="panel-heading">
            <h2>Accesos pendientes de activación</h2>
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
