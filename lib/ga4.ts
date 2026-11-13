import { getPool } from "@/db";
import { decryptToken } from "./google-ads";
import { env } from "./env";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export async function ga4Connection(clientId: string) {
  const { rows } = await getPool().query(
    "SELECT * FROM ga4_connections WHERE client_id=$1",
    [clientId],
  );
  return rows[0] as
    | {
        client_id: string;
        refresh_token: string;
        property_id: string | null;
        property_name: string | null;
        time_zone: string | null;
      }
    | undefined;
}
export async function ga4AccessToken(clientId: string) {
  const saved = await ga4Connection(clientId);
  if (!saved) throw new Error("Primero conecta Google Analytics.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: await decryptToken(saved.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new Error(
      "Google no pudo renovar el acceso a Analytics. Vuelve a autorizar la conexión.",
    );
  const token = (await response.json()) as { access_token: string };
  return token.access_token;
}
export async function ga4Fetch(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Google no autorizó esta consulta: revisa el acceso a la propiedad y que las API de Analytics estén habilitadas en Google Cloud."
        : `No se pudo consultar Google Analytics (HTTP ${response.status}).`,
    );
  return response.json();
}
