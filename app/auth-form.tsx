"use client";
import { useState, useEffect } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { authClient } from "./auth-client";
export default function AuthForm({
  mode,
  audience = "shared",
  otherPortal,
}: {
  mode: "login" | "activate" | "reset";
  audience?: "shared" | "agency" | "client";
  otherPortal?: string;
}) {
  const agency = audience === "agency";
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [confirm, setConfirm] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [recover, setRecover] = useState(false),
    [invitation, setInvitation] = useState<{
      email: string;
      clientName: string;
      existingUser: boolean;
    } | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (mode === "activate")
      fetch("/api/invitations?token=" + encodeURIComponent(t))
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setInvitation(d);
          setEmail(d.email);
        })
        .catch((e) => setError(e.message));
  }, [mode]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "activate") {
        if (!invitation?.existingUser && password !== confirm)
          throw new Error("Las contraseñas no coinciden.");
        const r = await fetch("/api/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, name, password }),
          }),
          d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setMessage("Tu acceso está listo. Ya puedes iniciar sesión.");
        setInvitation(null);
        return;
      }
      if (mode === "reset") {
        if (password !== confirm)
          throw new Error("Las contraseñas no coinciden.");
        const r = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (r.error)
          throw new Error(
            "El enlace venció o no es válido. Solicita uno nuevo.",
          );
        setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
        return;
      }
      if (recover) {
        const r = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (r.error)
          throw new Error(
            "No se pudo solicitar la recuperación. Contacta a AgenciaLabs.",
          );
        setMessage(
          "Si el correo tiene una cuenta, recibirás un enlace para recuperar el acceso.",
        );
        return;
      }
      const r = await authClient.signIn.email({ email, password });
      if (r.error)
        throw new Error(
          r.error.status === 429
            ? "Demasiados intentos. Espera un minuto."
            : "No pudimos ingresar. Revisa tu correo, contraseña y que estés en el portal correcto.",
        );
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo continuar.");
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "activate"
      ? "Bienvenido a tu portal."
      : mode === "reset"
        ? "Una nueva contraseña."
        : recover
          ? "Recupera tu acceso."
          : agency
            ? "Administración de clientes."
            : "Tus campañas, en un lugar.";
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/login">
          <span className="brand-lockup">
            <img
              className="brand-logo"
              src="/branding/agencialabs.jpg"
              alt="AgenciaLabs.cl"
            />
            <small>
              {agency ? "ADMINISTRACIÓN DE LA AGENCIA" : "PORTAL DE CLIENTES"}
            </small>
          </span>
        </a>
        <div>
          <span className="eyebrow">CLARIDAD PARA CRECER</span>
          <h1>
            {agency ? (
              <>
                Gestiona clientes
                <br />y campañas.
              </>
            ) : (
              <>
                Entiende el impacto
                <br />
                de tu publicidad.
              </>
            )}
          </h1>
          <p>
            {agency
              ? "Conecta cuentas y organiza los accesos de tus clientes."
              : "Resultados, inversión y trabajo de tu agencia."}
            <br />
            Una visión compartida para tomar mejores decisiones.
          </p>
          <div className="auth-points">
            <span>
              01{" "}
              <strong>
                {agency
                  ? "Tus clientes y sus cuentas"
                  : "Tus campañas de Google Ads"}
              </strong>
            </span>
            <span>
              02{" "}
              <strong>
                {agency
                  ? "Accesos y conexiones de Google Ads"
                  : "Resultados y evolución"}
              </strong>
            </span>
            <span>
              03{" "}
              <strong>
                {agency
                  ? "Seguimiento de campañas"
                  : "Gestiones de AgenciaLabs"}
              </strong>
            </span>
          </div>
        </div>
        <small>
          <ShieldCheck size={15} /> Un espacio privado para tu empresa.
        </small>
      </section>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <span className="eyebrow">
            {agency ? "ACCESO DE LA AGENCIA" : "ACCESO DE CLIENTES"}
          </span>
          <h2>{title}</h2>
          <p>
            {mode === "activate"
              ? invitation
                ? `Activa tu acceso a ${invitation.clientName}.`
                : "Ingresa desde la invitación de tu agencia."
              : recover
                ? "Te enviaremos un enlace a tu correo."
                : "Accede con tu correo y contraseña."}
          </p>
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
          {!message && (
            <>
              {mode === "login" && (
                <>
                  <label htmlFor="email">Correo electrónico</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </>
              )}
              {mode === "activate" && invitation && (
                <>
                  <label>Correo de tu invitación</label>
                  <p className="invite-email">{email}</p>
                  {invitation.existingUser ? (
                    <p>
                      Ya tienes una cuenta.{" "}
                      <a href="/login" target="_blank" rel="noreferrer">
                        Inicia sesión con este correo
                      </a>{" "}
                      y vuelve aquí para aceptar.
                    </p>
                  ) : (
                    <>
                      <label htmlFor="name">Tu nombre</label>
                      <input
                        id="name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </>
                  )}
                </>
              )}
              {((!recover && mode === "login") ||
                mode === "reset" ||
                (mode === "activate" &&
                  invitation &&
                  !invitation.existingUser)) && (
                <>
                  <label htmlFor="password">
                    {mode === "login" ? "Contraseña" : "Elige una contraseña"}
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode !== "login" && (
                    <>
                      <small>Al menos 12 caracteres.</small>
                      <label htmlFor="confirm">Repite la contraseña</label>
                      <input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </>
                  )}
                </>
              )}
              <button
                className="button primary"
                disabled={busy || (mode === "activate" && !invitation)}
              >
                {busy
                  ? "Un momento…"
                  : mode === "activate"
                    ? "Activar mi acceso"
                    : mode === "reset"
                      ? "Guardar contraseña"
                      : recover
                        ? "Enviar enlace"
                        : "Entrar al portal"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {mode === "login" ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRecover(!recover);
                setMessage("");
                setError("");
              }}
            >
              {recover ? "Volver al inicio de sesión" : "Olvidé mi contraseña"}
            </button>
          ) : (
            <a className="text-button" href="/login">
              Ir al inicio de sesión
            </a>
          )}
          <p className="auth-help">
            {agency
              ? "Acceso exclusivo para la administración de AgenciaLabs."
              : "¿Aún no tienes acceso? Solicita una invitación a tu ejecutivo de AgenciaLabs."}
          </p>
          {otherPortal && (
            <p className="auth-help">
              <a href={otherPortal + "/login"}>
                {agency
                  ? "¿Eres cliente? Entra a tu portal →"
                  : "Acceso de la agencia →"}
              </a>
            </p>
          )}
        </form>
        <small>© 2026 AgenciaLabs</small>
      </main>
    </div>
  );
}
