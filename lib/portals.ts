export type PortalConfig = {
  origin: string;
  audience: "shared" | "agency" | "client";
};
export function configuredPortals(): PortalConfig[] {
  if (!process.env.SITE_URL) throw new Error("SITE_URL no está configurada.");
  const agency = new URL(process.env.SITE_URL).origin;
  const client =
    process.env.CLIENT_SITE_URL && new URL(process.env.CLIENT_SITE_URL).origin;
  if (!client) return [{ origin: agency, audience: "shared" }];
  if (agency === client)
    throw new Error("Los portales deben tener direcciones diferentes.");
  return [
    { origin: agency, audience: "agency" },
    { origin: client, audience: "client" },
  ];
}
export function portalForHeaders(headers: Headers): PortalConfig | null {
  // Caddy preserves Host; forwarded headers never select an authentication realm.
  const host = headers.get("host");
  if (!host || /[\s/@\\?#]/.test(host)) return null;
  return (
    configuredPortals().find((p) => {
      const expected = new URL(p.origin);
      try {
        return new URL(expected.protocol + "//" + host).host === expected.host;
      } catch {
        return false;
      }
    }) || null
  );
}
export function roleMatchesPortal(
  portal: PortalConfig,
  isAdmin: boolean,
  hasClientAccess = false,
) {
  return (
    portal.audience === "shared" ||
    (portal.audience === "agency" ? isAdmin : !isAdmin || hasClientAccess)
  );
}
