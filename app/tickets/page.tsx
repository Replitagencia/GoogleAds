import { redirect } from "next/navigation";
import { getPortalUser, clientAccess } from "@/lib/access";
import TicketPanel from "./ticket-panel";
export const dynamic = "force-dynamic";
export default async function Tickets({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  const { clientId } = await searchParams;
  if (!clientId) redirect("/");
  let client;
  try {
    client = await clientAccess(user, clientId);
  } catch {
    return (
      <section className="standalone-card">
        <h1>Cliente no disponible</h1>
        <a href="/">Volver</a>
      </section>
    );
  }
  return (
    <main className="tickets-page">
      <header className="tickets-header">
        <a href={"/?clientId=" + encodeURIComponent(clientId)}>
          ← Volver a {client.name}
        </a>
        <span>AgenciaLabs · Portal de clientes</span>
      </header>
      <h1>Solicitudes</h1>
      <p>Crea solicitudes y revisa las respuestas de tu agencia.</p>
      <div className="message">
        Estamos probando esta sección. Las solicitudes quedan guardadas aquí;
        todavía no envían avisos por correo ni WhatsApp.
      </div>
      <TicketPanel clientId={clientId} admin={false} />
    </main>
  );
}
