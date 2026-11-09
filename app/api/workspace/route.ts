import { requireClient, AccessError, apiError } from "@/lib/access";
import { getDb } from "@/db";
import { accountBudgets, agencyActivities } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { connection, json, sameOrigin, errorMessage } from "@/lib/google-ads";
import { periods } from "@/lib/reporting";
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const saved = await connection(clientId);
    if (!saved?.customerId)
      return json({ error: "Selecciona una cuenta." }, 409);
    const month = periods(30, saved.timeZone || "America/Santiago").month;
    const [budget, activities] = await Promise.all([
      getDb()
        .select()
        .from(accountBudgets)
        .where(
          eq(accountBudgets.id, `${clientId}:${saved.customerId}:${month}`),
        )
        .then((rows) => rows[0]),
      getDb()
        .select({
          id: agencyActivities.id,
          kind: agencyActivities.kind,
          title: agencyActivities.title,
          body: agencyActivities.body,
          createdAt: agencyActivities.createdAt,
        })
        .from(agencyActivities)
        .where(
          and(
            eq(agencyActivities.clientId, clientId),
            eq(agencyActivities.customerId, saved.customerId),
          ),
        )
        .orderBy(desc(agencyActivities.createdAt))
        .limit(100),
    ]);
    return json({ month, budget: budget?.amount ?? null, activities });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  let input: any;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  try {
    const { clientId } = await requireClient(request, true);
    const saved = await connection(clientId);
    if (!saved?.customerId)
      return json({ error: "Selecciona una cuenta." }, 409);
    if (!input || typeof input !== "object")
      return json({ error: "Solicitud inválida." }, 400);
    if (input.type === "budget") {
      const month = periods(30, saved.timeZone || "America/Santiago").month;
      if (input.month !== month)
        return json(
          { error: "El mes cambió. Recarga la página antes de guardar." },
          409,
        );
      if (
        typeof input.amount !== "number" ||
        !Number.isFinite(input.amount) ||
        input.amount <= 0 ||
        input.amount > 1e12 ||
        !Number.isInteger(input.amount)
      )
        return json(
          { error: "Ingresa un presupuesto entero mayor que cero." },
          400,
        );
      const value = {
        id: `${clientId}:${saved.customerId}:${month}`,
        clientId,
        customerId: saved.customerId,
        month,
        amount: input.amount,
        updatedAt: Date.now(),
      };
      await getDb()
        .insert(accountBudgets)
        .values(value)
        .onConflictDoUpdate({
          target: accountBudgets.id,
          set: { amount: value.amount, updatedAt: value.updatedAt },
        });
    } else if (input.type === "activity") {
      if (
        !["done", "next", "note"].includes(input.kind) ||
        typeof input.title !== "string" ||
        !input.title.trim() ||
        input.title.length > 120 ||
        typeof input.body !== "string" ||
        input.body.length > 2000
      )
        return json(
          {
            error:
              "Revisa el título (máximo 120 caracteres) y la descripción (máximo 2.000).",
          },
          400,
        );
      await getDb()
        .insert(agencyActivities)
        .values({
          id: crypto.randomUUID(),
          clientId,
          customerId: saved.customerId,
          kind: input.kind,
          title: input.title.trim(),
          body: input.body.trim(),
          createdAt: Date.now(),
        });
    } else return json({ error: "Acción no válida." }, 400);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AccessError) return apiError(e);
    return json({ error: errorMessage(e) }, 502);
  }
}
