import { getPool } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getPool().query("SELECT 1 FROM clients LIMIT 1");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
