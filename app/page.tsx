import { redirect } from "next/navigation";
import { getPortalUser, availableClients, clientAccess } from "@/lib/access";
import Portal from "./portal";
import Logout from "./logout";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  const { clientId } = await searchParams;
  if (clientId) {
    try {
      const client = await clientAccess(user, clientId);
      return (
        <Portal
          key={clientId}
          clientId={clientId}
          clientName={client.name}
          isAdmin={user.isAdmin}
          userEmail={user.email}
        />
      );
    } catch {
      return (
        <section className="standalone-card">
          <h1>Cliente no disponible</h1>
          <a href="/">Volver a mis clientes</a>
        </section>
      );
    }
  }
  if (user.isAdmin) redirect("/admin");
  const clients = await availableClients(user);
  if (clients.length === 1) redirect("/?clientId=" + clients[0].id);
  return (
    <section className="standalone-card">
      <h1>Mis empresas</h1>
      <p>
        {clients.length
          ? "Elige el espacio que quieres consultar."
          : "Tu agencia todavía no te ha asignado un cliente activo."}
      </p>
      {clients.map((c) => (
        <p key={c.id}>
          <a href={"/?clientId=" + c.id}>{c.name} →</a>
        </p>
      ))}
      <Logout />
    </section>
  );
}
