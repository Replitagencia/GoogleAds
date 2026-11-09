import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/access";
import AdminPanel from "./panel";
export const dynamic = "force-dynamic";
export default async function Admin() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");
  return <AdminPanel email={user.email} />;
}
