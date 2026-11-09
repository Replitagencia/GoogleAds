import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/access";
import TicketPanel from "../../tickets/ticket-panel";
export const dynamic = "force-dynamic";
export default async function AgencyTickets() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");
  return (
    <main className="tickets-page">
      <header className="tickets-header">
        <a href="/admin">← Volver a administración</a>
        <span>AgenciaLabs · Administración</span>
      </header>
      <h1>Solicitudes de clientes</h1>
      <p>Asigna responsables, responde y mantén al día cada solicitud.</p>
      <div className="message">
        Sección en prueba: revisa esta bandeja para ver nuevas solicitudes. Aún
        no se envían avisos por correo ni WhatsApp.
      </div>
      <TicketPanel admin={true} />
    </main>
  );
}
