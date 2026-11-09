import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { configuredPortals, portalForHeaders } from "@/lib/portals";
import AuthForm from "./auth-form";
export default async function AuthPage({
  mode,
}: {
  mode: "login" | "activate" | "reset";
}) {
  const portal = portalForHeaders(await headers());
  if (!portal) notFound();
  const other = configuredPortals().find((p) => p.origin !== portal.origin);
  return (
    <AuthForm
      mode={mode}
      audience={portal.audience}
      otherPortal={other?.origin}
    />
  );
}
