import { env } from "./env";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
import { portalForHeaders } from "./portals";
export function configuration() {
  return {
    ready: !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.TOKEN_ENCRYPTION_KEY &&
      env.SITE_URL
    ),
    redirectUri: `${env.SITE_URL || "http://localhost:3000"}/api/google/callback`,
  };
}
export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function sameOrigin(request: Request) {
  const portal = portalForHeaders(request.headers);
  return !!portal && request.headers.get("origin") === portal.origin;
}
export async function connection(clientId: string) {
  return getDb()
    .select()
    .from(connections)
    .where(eq(connections.clientId, clientId))
    .then((rows) => rows[0]);
}
function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function base64ToBytes(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function encryptionKey() {
  if (!env.TOKEN_ENCRYPTION_KEY)
    throw new Error("Falta configurar la protección de la conexión.");
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(env.TOKEN_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
async function decryptToken(value: string) {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(iv) },
      await encryptionKey(),
      base64ToBytes(data),
    ),
  );
}
export async function accessToken(clientId: string) {
  const saved = await connection(clientId);
  if (!saved) throw new Error("Conecta tu cuenta de Google para continuar.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: await decryptToken(saved.refreshToken),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new Error(
      "Google no pudo renovar el acceso. Vuelve a conectar tu cuenta.",
    );
  const result = (await response.json()) as { access_token: string };
  return result.access_token;
}
export async function searchAds(
  token: string,
  customerId: string,
  query: string,
): Promise<any[]> {
  if (!/^\d{10}$/.test(customerId))
    throw new Error("El ID de la cuenta debe tener 10 dígitos.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (env.GOOGLE_ADS_DEVELOPER_TOKEN)
    headers["developer-token"] = env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const response = await fetch(
    `https://googleads.googleapis.com/v26/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Google no autorizó la consulta. Revisa el acceso de tu usuario a esta cuenta y la habilitación de Google Ads API en Google Cloud.",
      );
    throw new Error(
      `No se pudo consultar Google Ads (HTTP ${response.status}). Revisa la configuración de la cuenta.`,
    );
  }
  const batches = (await response.json()) as { results?: any[] }[];
  return batches.flatMap((batch) => batch.results || []);
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la solicitud.";
}
