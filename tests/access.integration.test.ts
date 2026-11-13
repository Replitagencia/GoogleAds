import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { getPool } from "../db";
import { createInvitation } from "../lib/invitations";
import { encryptToken } from "../lib/google-ads";
import { demoReport } from "../lib/demo";
import { periods } from "../lib/reporting";
const base = process.env.SITE_URL!;
if (
  !process.env.DATABASE_URL?.includes("agencialabs_test") ||
  !base.startsWith("http://127.0.0.1:")
)
  throw new Error(
    "Esta prueba solo puede ejecutarse contra la base local agencialabs_test.",
  );
const password = randomBytes(20).toString("base64url"),
  adminEmail = "qa-admin@example.test",
  emailA = "qa-eticsa@example.test",
  emailB = "qa-otro@example.test";
let adminCookie = "",
  cookieA = "",
  cookieB = "",
  tokenA = "",
  clientA = "",
  clientB = "";
const mail: string[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"],
  onData(stream, session, callback) {
    let text = "";
    stream.on("data", (chunk) => (text += chunk));
    stream.on("end", () => {
      mail.push(text);
      callback();
    });
  },
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  origin = base,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === "POST"
        ? { "Content-Type": "application/json", origin }
        : {}),
      "x-real-ip": "127.0.0.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data, status: response.status };
}
async function login(email: string, pw = password) {
  const r = await request("/api/auth/sign-in/email", "POST", {
    email,
    password: pw,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.response.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
}
async function activate(url: string, email: string) {
  const token = new URL(url).searchParams.get("token")!;
  const r = await request("/api/invitations", "POST", {
    token,
    name: email,
    password,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return token;
}
before(async () => {
  await new Promise<void>((resolve) => smtp.listen(1026, "127.0.0.1", resolve));
  await getPool().query(
    'TRUNCATE audit_log,invitations,memberships,google_connections,oauth_states,account_budgets,agency_activities,report_cache,portal_users,clients,session,account,verification,"rateLimit","user" RESTART IDENTITY CASCADE',
  );
  await activate(
    await createInvitation(adminEmail, null, null, true),
    adminEmail,
  );
  adminCookie = await login(adminEmail);
  for (const [email, name] of [
    [emailA, "Eticsa · prueba"],
    [emailB, "Segundo cliente · prueba"],
  ]) {
    const c = await request(
      "/api/admin",
      "POST",
      { action: "create-client", name },
      adminCookie,
    );
    assert.equal(c.status, 200);
    const id = c.data.id;
    const invite = await request(
      "/api/admin",
      "POST",
      { action: "invite", email, clientId: id },
      adminCookie,
    );
    assert.equal(invite.status, 200);
    const token = await activate(invite.data.url, email);
    if (email === emailA) {
      clientA = id;
      tokenA = token;
      cookieA = await login(email);
    } else {
      clientB = id;
      cookieB = await login(email);
    }
  }
  const now = Date.now(),
    period = periods(30, "America/Santiago");
  for (const [id, customer, amount] of [
    [clientA, "1111111111", 100],
    [clientB, "2222222222", 900],
  ] as const) {
    await getPool().query(
      "INSERT INTO google_connections(client_id,refresh_token,customer_id,account_name,currency,time_zone,updated_at) VALUES($1,$2,$3,$4,'CLP','America/Santiago',$5)",
      [
        id,
        await encryptToken("token-sintetico-solo-pruebas"),
        customer,
        id === clientA ? "Eticsa · prueba" : "Otro · prueba",
        now,
      ],
    );
    await getPool().query(
      "INSERT INTO account_budgets(id,client_id,customer_id,month,amount,updated_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        `${id}:${customer}:${period.month}`,
        id,
        customer,
        period.month,
        amount,
        now,
      ],
    );
    await getPool().query(
      "INSERT INTO report_cache(id,payload,expires_at) VALUES($1,$2,$3)",
      [
        `v2:${id}:${customer}:${now}:30:${period.today}`,
        JSON.stringify({
          ...demoReport(30),
          customerId: customer,
          accountName:
            id === clientA
              ? "Eticsa · datos de prueba"
              : "Otro · datos de prueba",
        }),
        now + 3600000,
      ],
    );
  }
});
after(async () => {
  await new Promise<void>((resolve) => smtp.close(() => resolve()));
  await getPool().end();
});
test("sin sesión no se pueden leer datos ni usar encabezados de ChatGPT falsificados", async () => {
  for (const path of [
    "/api/admin",
    `/api/report?clientId=${clientA}`,
    `/api/workspace?clientId=${clientA}`,
    `/api/google/status?clientId=${clientA}`,
  ])
    assert.equal((await request(path)).status, 401);
  const r = await fetch(base + "/api/admin", {
    headers: {
      "oai-authenticated-user-id": "885944ac-c858-4037-82d6-3275861c16ac",
      "oai-authenticated-user-email": adminEmail,
    },
  });
  assert.equal(r.status, 401);
});
test("el reporte especial exige acceso al cliente autorizado", async () => {
  const eticsa = "c3dd11c2-d156-4b4f-bd10-fa7d3a6ec519";
  assert.equal(
    (await request(`/api/report/eticsa?clientId=${eticsa}`)).status,
    401,
  );
  assert.equal(
    (
      await request(
        `/api/report/eticsa?clientId=${eticsa}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/report/eticsa?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    404,
  );
});
test("la vista consolidada usa una caché separada y respeta los permisos", async () => {
  const id = "c3dd11c2-d156-4b4f-bd10-fa7d3a6ec519",
    customer = "3213724556",
    now = Date.now();
  const period = periods(30, "America/Santiago");
  const key = `selected-v1:${id}:${customer}:${now}:30:${period.today}`;
  const fixture = {
    ...demoReport(30),
    source: "google",
    customerId: customer,
    scopeLabel: "Campaña de Busqueda + Pmax Eticsa",
  };
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO clients(id,name) VALUES($1,'Eticsa de prueba')",
      [id],
    );
    await pool.query(
      'INSERT INTO memberships(user_id,client_id) SELECT id,$1 FROM "user" WHERE email=$2',
      [id, emailA],
    );
    await pool.query(
      "INSERT INTO google_connections(client_id,refresh_token,customer_id,account_name,currency,time_zone,updated_at) VALUES($1,$2,$3,'Prueba','CLP','America/Santiago',$4)",
      [id, await encryptToken("solo-prueba"), customer, now],
    );
    await pool.query(
      "INSERT INTO report_cache(id,payload,expires_at) VALUES($1,$2,$3)",
      [key, JSON.stringify(fixture), now + 60000],
    );
    const allowed = await request(
      `/api/report?days=30&scope=selected&clientId=${id}`,
      "GET",
      undefined,
      cookieA,
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.data.scopeLabel, fixture.scopeLabel);
    assert.equal(
      (
        await request(
          `/api/report?days=30&scope=selected&clientId=${id}`,
          "GET",
          undefined,
          cookieB,
        )
      ).status,
      404,
    );
    await pool.query(
      "UPDATE google_connections SET customer_id='1111111111' WHERE client_id=$1",
      [id],
    );
    assert.equal(
      (
        await request(
          `/api/report?days=30&scope=selected&clientId=${id}`,
          "GET",
          undefined,
          cookieA,
        )
      ).status,
      409,
    );
  } finally {
    await pool.query("DELETE FROM report_cache WHERE id=$1", [key]);
    await pool.query("DELETE FROM google_connections WHERE client_id=$1", [id]);
    await pool.query("DELETE FROM clients WHERE id=$1", [id]);
  }
});
test("registro público cerrado e invitaciones de un solo uso", async () => {
  assert.notEqual(
    (
      await request("/api/auth/sign-up/email", "POST", {
        email: "stranger@example.test",
        name: "Sin invitación",
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/invitations", "POST", {
        token: tokenA,
        name: "Otra persona",
        password,
      })
    ).status,
    410,
  );
});
test("cada cliente puede leer únicamente sus datos incluso cambiando clientId", async () => {
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).data.budget,
    100,
  );
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientB}`,
        "GET",
        undefined,
        cookieB,
      )
    ).data.budget,
    900,
  );
  for (const path of ["report", "workspace", "google/status"]) {
    assert.equal(
      (
        await request(
          `/api/${path}?clientId=${clientB}`,
          "GET",
          undefined,
          cookieA,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/api/${path}?clientId=${clientA}`,
          "GET",
          undefined,
          cookieB,
        )
      ).status,
      404,
    );
  }
  const report = await request(
    `/api/report?clientId=${clientA}`,
    "GET",
    undefined,
    cookieA,
  );
  assert.equal(report.status, 200);
  assert.equal(report.data.customerId, "1111111111");
});
test("cliente no puede administrar, reconectar Google ni escribir gestiones", async () => {
  assert.equal(
    (await request("/api/admin", "GET", undefined, cookieA)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin",
        "POST",
        { action: "create-client", name: "Intruso" },
        cookieA,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/google/connect?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/google/account?clientId=${clientA}`,
        "POST",
        { customerId: "2222222222" },
        cookieA,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientA}`,
        "POST",
        { type: "activity", kind: "done", title: "No autorizado", body: "" },
        cookieA,
      )
    ).status,
    403,
  );
});
test("GA4: solo la agencia configura y cada cliente consulta su conexión", async () => {
  for (const path of [
    `/api/ga4/status?clientId=${clientA}`,
    `/api/ga4/report?clientId=${clientA}`,
  ]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, "GET", undefined, cookieB)).status, 404);
    const own = await request(path, "GET", undefined, cookieA);
    assert.equal(own.status, 200);
    assert.equal(own.data.connected, false);
  }
  assert.equal(
    (
      await request(
        `/api/ga4/connect?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/ga4/property?clientId=${clientA}`,
        "POST",
        { propertyId: "123456789" },
        cookieA,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/ga4/property?clientId=${clientA}`,
        "POST",
        { propertyId: "123456789" },
        adminCookie,
        "https://forged.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/ga4/property?clientId=${clientA}`,
        "POST",
        { propertyId: "G-12345" },
        adminCookie,
      )
    ).status,
    400,
  );
});
test("cancelar autorización GA4 no altera Google Ads y consume el estado una vez", async () => {
  const db = getPool(),
    state = randomUUID();
  const admin = await db.query('SELECT id FROM "user" WHERE email=$1', [
    adminEmail,
  ]);
  const before = await db.query(
    "SELECT customer_id,refresh_token FROM google_connections WHERE client_id=$1",
    [clientA],
  );
  await db.query(
    "INSERT INTO ga4_oauth_states(state,user_id,client_id,expires_at) VALUES($1,$2,$3,$4)",
    [state, admin.rows[0].id, clientA, Date.now() + 60000],
  );
  assert.equal(
    (
      await request(
        `/api/google/callback?state=${state}&error=access_denied`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    403,
  );
  const cancelled = await request(
    `/api/google/callback?state=${state}&error=access_denied`,
    "GET",
    undefined,
    adminCookie,
  );
  assert.equal(cancelled.status, 303);
  assert.match(
    cancelled.response.headers.get("location") || "",
    /notice=ga4_cancelled/,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM ga4_oauth_states WHERE state=$1", [state]))
      .rowCount,
    0,
  );
  const after = await db.query(
    "SELECT customer_id,refresh_token FROM google_connections WHERE client_id=$1",
    [clientA],
  );
  assert.deepEqual(after.rows, before.rows);
});
test("administrador puede escribir y ver ambos clientes; CSRF rechazado", async () => {
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientB}`,
        "GET",
        undefined,
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientA}`,
        "POST",
        {
          type: "activity",
          kind: "done",
          title: "Gestión de prueba",
          body: "Solo para verificar permisos.",
        },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/admin",
        "POST",
        { action: "create-client", name: "CSRF" },
        adminCookie,
        "https://otro.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/workspace?clientId=${clientA}`,
        "POST",
        { type: "activity", kind: "done", title: "CSRF", body: "" },
        adminCookie,
        "https://otro.example",
      )
    ).status,
    403,
  );
});
test("crear cliente y acceso es exclusivo del administrador y no deja empresas si falla", async () => {
  const count = async () =>
    Number(
      (await getPool().query("SELECT count(*) FROM clients")).rows[0].count,
    );
  const initial = await count();
  const body = {
    action: "create-client-access",
    name: "Empresa inválida",
    email: "sin-correo",
  };
  assert.equal(
    (await request("/api/admin", "POST", body, cookieA)).status,
    403,
  );
  assert.equal(
    (await request("/api/admin", "POST", body, adminCookie)).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/admin",
        "POST",
        { ...body, email: adminEmail },
        adminCookie,
      )
    ).status,
    409,
  );
  assert.equal(await count(), initial);
});
test("un nuevo cliente activa su cuenta y entra solo a sus campañas", async () => {
  const email = "qa-nuevo@example.test";
  const created = await request(
    "/api/admin",
    "POST",
    {
      action: "create-client-access",
      name: "Cliente nuevo",
      email,
      isAdmin: true,
    },
    adminCookie,
  );
  assert.equal(created.status, 200);
  const id = created.data.id;
  const pending = await request("/api/admin", "GET", undefined, adminCookie);
  assert.ok(
    pending.data.invitations.some(
      (i: any) => i.client_id === id && i.email === email,
    ),
  );
  await activate(created.data.url, email);
  await getPool().query('DELETE FROM "rateLimit"');
  const cookie = await login(email);
  const home = await request("/", "GET", undefined, cookie);
  assert.equal(home.response.headers.get("location"), "/?clientId=" + id);
  assert.equal(
    (await request("/api/admin", "GET", undefined, cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/google/status?clientId=${id}`,
        "GET",
        undefined,
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/api/report?clientId=${clientA}`, "GET", undefined, cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/admin",
        "POST",
        { action: "invite", clientId: id, email },
        adminCookie,
      )
    ).status,
    409,
  );
  const used = await request("/api/admin", "GET", undefined, adminCookie);
  assert.ok(
    !used.data.invitations.some(
      (i: any) => i.client_id === id && i.email === email,
    ),
  );
});

test("checklist se crea por cliente y solo la agencia puede modificarlo", async () => {
  const list = await request("/api/admin", "GET", undefined, adminCookie);
  const tasks = list.data.checklist.filter(
    (item: any) => item.client_id === clientA,
  );
  assert.equal(tasks.length, 10);
  assert.ok(tasks.every((item: any) => !item.completed));
  const update = {
    action: "checklist-status",
    clientId: clientA,
    itemKey: tasks[0].item_key,
    completed: true,
  };
  assert.equal(
    (await request("/api/admin", "POST", update, cookieA)).status,
    403,
  );
  assert.equal(
    (await request("/api/admin", "POST", update, adminCookie)).status,
    200,
  );
  const after = await request("/api/admin", "GET", undefined, adminCookie);
  assert.equal(
    after.data.checklist.find(
      (item: any) =>
        item.client_id === clientA && item.item_key === tasks[0].item_key,
    ).completed,
    true,
  );
  assert.ok(
    after.data.checklist.find(
      (item: any) =>
        item.client_id === clientA && item.item_key === tasks[0].item_key,
    ).completed_at,
  );
  assert.ok(
    after.data.checklist
      .filter((item: any) => item.client_id === clientB)
      .every((item: any) => !item.completed),
  );
  const custom = {
    action: "checklist-add",
    clientId: clientA,
    title: "Preparar informe de bienvenida",
  };
  assert.equal(
    (await request("/api/admin", "POST", custom, cookieA)).status,
    403,
  );
  assert.equal(
    (await request("/api/admin", "POST", custom, adminCookie)).status,
    200,
  );
  const updated = await request("/api/admin", "GET", undefined, adminCookie);
  assert.ok(
    updated.data.checklist.some(
      (item: any) =>
        item.client_id === clientA &&
        item.title === custom.title &&
        !item.completed,
    ),
  );
  const stage = {
    action: "checklist-update",
    clientId: clientA,
    itemKey: tasks[0].item_key,
    stage: "approval",
    status: "waiting_client",
    responsible: "Cliente",
    dueDate: "2026-11-20",
    evidence: "Correo de aprobación de prueba",
  };
  assert.equal(
    (await request("/api/admin", "POST", stage, cookieA)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin",
        "POST",
        { ...stage, dueDate: "2026-02-30" },
        adminCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/admin", "POST", stage, adminCookie)).status,
    200,
  );
  const revised = await request("/api/admin", "GET", undefined, adminCookie);
  const item = revised.data.checklist.find(
    (t: any) => t.client_id === clientA && t.item_key === stage.itemKey,
  );
  assert.equal(item.workflow_status, "waiting_client");
  assert.equal(item.responsible, "Cliente");
  assert.equal(item.due_date, "2026-11-20");
  assert.equal(item.evidence, stage.evidence);
  assert.equal(item.completed, false);
  assert.equal(item.completed_at, null);
  await getPool().query(
    await (
      await import("node:fs/promises")
    ).readFile(new URL("../db/saas.sql", import.meta.url), "utf8"),
  );
  const afterMigration = await request(
    "/api/admin",
    "GET",
    undefined,
    adminCookie,
  );
  const preserved = afterMigration.data.checklist.find(
    (t: any) => t.client_id === clientA && t.item_key === stage.itemKey,
  );
  assert.equal(preserved.workflow_status, "waiting_client");
  assert.equal(preserved.evidence, stage.evidence);
  assert.equal(
    afterMigration.data.checklist.filter((t: any) => t.client_id === clientA)
      .length,
    11,
  );
});

test("la ficha y notas internas solo están disponibles para la agencia", async () => {
  const profile = {
    action: "save-profile",
    clientId: clientA,
    contactName: "Contacto de prueba",
    contactEmail: "contacto@example.test",
    contactPhone: "123",
    responsible: "Ejecutivo",
    internalNotes: "Nota interna confidencial",
  };
  assert.equal(
    (await request("/api/admin", "POST", profile, cookieA)).status,
    403,
  );
  assert.equal(
    (await request("/api/admin", "POST", profile, adminCookie)).status,
    200,
  );
  const list = await request("/api/admin", "GET", undefined, adminCookie);
  assert.equal(
    list.data.profiles.find((p: any) => p.client_id === clientA).internal_notes,
    profile.internalNotes,
  );
  const report = await request(
    `/api/report?clientId=${clientA}`,
    "GET",
    undefined,
    cookieA,
  );
  assert.ok(!JSON.stringify(report.data).includes(profile.internalNotes));
});

test("gestiones internas de agencia están aisladas de los clientes", async () => {
  const entry = {
    action: "work-log-add",
    clientId: clientA,
    kind: "optimization",
    title: "Optimización de prueba",
    body: "Observación interna de prueba",
  };
  assert.equal(
    (await request("/api/admin", "POST", entry, cookieA)).status,
    403,
  );
  assert.equal(
    (await request("/api/admin", "POST", entry, adminCookie)).status,
    200,
  );
  const list = await request("/api/admin", "GET", undefined, adminCookie);
  assert.ok(
    list.data.workLog.some(
      (x: any) => x.client_id === clientA && x.title === entry.title,
    ),
  );
  assert.ok(
    list.data.workLog.some(
      (x: any) =>
        x.client_id === clientA &&
        x.title === "Gestión de prueba" &&
        x.shared === true,
    ),
  );
  assert.ok(
    list.data.workLog.some(
      (x: any) =>
        x.client_id === clientA &&
        x.title === entry.title &&
        x.shared === false,
    ),
  );
  const workspace = await request(
    `/api/workspace?clientId=${clientA}`,
    "GET",
    undefined,
    cookieA,
  );
  assert.ok(!JSON.stringify(workspace.data).includes(entry.body));
});

test("resumen por cuenta distingue datos reales, presupuesto y datos vencidos", async () => {
  const pool = getPool(),
    old = (
      await pool.query(
        "SELECT id,payload,expires_at FROM report_cache WHERE id LIKE $1",
        [`v2:${clientA}:%`],
      )
    ).rows[0];
  const period = periods(30, "America/Santiago");
  const report = {
    source: "google",
    days: 30,
    customerId: "1111111111",
    fetchedAt: new Date().toISOString(),
    currency: "CLP",
    campaignStatuses: [
      {
        id: "3",
        name: "No apta",
        status: "ENABLED",
        primaryStatus: "NOT_ELIGIBLE",
      },
      {
        id: "1",
        name: "Pausada de prueba",
        status: "PAUSED",
        primaryStatus: "PAUSED",
      },
    ],
    campaigns: [
      { id: "1", name: "Pausada de prueba", status: "PAUSED" },
      { id: "2", name: "Activa", status: "ENABLED" },
    ],
    insights: {
      period,
      unavailable: [],
      totals: { cost: 100, clicks: 25, conversions: 30 },
      previous: { conversions: 20 },
      monthCost: 85,
    },
  };
  try {
    await pool.query(
      "UPDATE report_cache SET payload=$2,expires_at=$3 WHERE id=$1",
      [old.id, JSON.stringify(report), Date.now() + 60000],
    );
    const active = await request("/api/admin", "GET", undefined, adminCookie);
    const summary = active.data.clients.find(
      (c: any) => c.id === clientA,
    ).summary;
    assert.equal(summary.state, "available");
    assert.equal(summary.fresh, true);
    assert.equal(summary.cost, 100);
    assert.equal(summary.conversionChange, 50);
    assert.equal(summary.monthCost, 85);
    assert.equal(summary.budget, 100);
    assert.equal(summary.pausedCampaigns[0].name, "Pausada de prueba");
    assert.equal(summary.notServingCampaigns[0].name, "No apta");
    assert.equal(summary.campaignStatusAvailable, true);
    const forcedByClient = await request(
      `/api/report?clientId=${clientA}&days=30&refresh=1`,
      "GET",
      undefined,
      cookieA,
    );
    assert.equal(forcedByClient.status, 200);
    assert.equal(forcedByClient.data.customerId, "1111111111");
    assert.equal(
      active.data.clients.find((c: any) => c.id === clientB).summary.state,
      "unavailable",
    );
    const legacy = {
      ...report,
      campaignStatuses: undefined,
      insights: { ...report.insights, previous: { conversions: 0 } },
    };
    await pool.query("UPDATE report_cache SET payload=$2 WHERE id=$1", [
      old.id,
      JSON.stringify(legacy),
    ]);
    const older = await request("/api/admin", "GET", undefined, adminCookie);
    const olderSummary = older.data.clients.find(
      (c: any) => c.id === clientA,
    ).summary;
    assert.equal(olderSummary.conversionChange, null);
    assert.equal(olderSummary.campaignStatusAvailable, false);
    assert.deepEqual(olderSummary.pausedCampaigns, []);
    await pool.query("UPDATE report_cache SET expires_at=0 WHERE id=$1", [
      old.id,
    ]);
    const stale = await request("/api/admin", "GET", undefined, adminCookie);
    assert.equal(
      stale.data.clients.find((c: any) => c.id === clientA).summary.fresh,
      false,
    );
  } finally {
    await pool.query(
      "UPDATE report_cache SET payload=$2,expires_at=$3 WHERE id=$1",
      [old.id, old.payload, old.expires_at],
    );
  }
});

test("solicitudes: cliente crea y conversa; agencia asigna y gestiona; otros clientes no acceden", async () => {
  const body = {
    action: "create",
    clientId: clientA,
    subject: "Actualizar promoción",
    message: "Por favor revisar el anuncio.",
  };
  assert.equal((await request("/api/tickets", "POST", body)).status, 401);
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        body,
        cookieA,
        "http://origen-invalido.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { ...body, clientId: clientB },
        cookieA,
      )
    ).status,
    404,
  );
  const created = await request("/api/tickets", "POST", body, cookieA);
  assert.equal(created.status, 200);
  const ticketId = created.data.id;
  assert.equal(
    (
      await request(
        `/api/tickets?ticketId=${ticketId}`,
        "GET",
        undefined,
        cookieB,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "reply", ticketId, message: "Intruso" },
        cookieB,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "status", ticketId, status: "resolved" },
        cookieA,
      )
    ).status,
    403,
  );
  const inbox = await request("/api/tickets", "GET", undefined, adminCookie);
  assert.ok(
    inbox.data.tickets.some(
      (t: any) => t.id === ticketId && t.client_id === clientA,
    ),
  );
  const adminId = (
    await getPool().query('SELECT id FROM "user" WHERE email=$1', [adminEmail])
  ).rows[0].id;
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "assign", ticketId, userId: adminId },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "status", ticketId, status: "waiting_client" },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "reply", ticketId, message: "Necesitamos los materiales." },
        adminCookie,
      )
    ).status,
    200,
  );
  const thread = await request(
    `/api/tickets?ticketId=${ticketId}`,
    "GET",
    undefined,
    cookieA,
  );
  assert.deepEqual(
    thread.data.messages.map((m: any) => m.body),
    [body.message, "Necesitamos los materiales."],
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "status", ticketId, status: "closed" },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/tickets",
        "POST",
        { action: "reply", ticketId, message: "Ya no debe entrar." },
        cookieA,
      )
    ).status,
    409,
  );
});

test("la vista previa muestra el portal del cliente sin ampliar sus permisos", async () => {
  const page = async (id: string, cookie: string) => {
    const r = await fetch(`${base}/?clientId=${id}&preview=client`, {
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(r.status, 200);
    return r.text();
  };
  const preview = await page(clientA, adminCookie);
  assert.match(preview, /Vista del cliente/);
  assert.match(preview, /Volver a administración/);
  assert.doesNotMatch(preview, /Configurar cuenta/);
  assert.doesNotMatch(preview, /Conexión Google Ads/);
  const clientPage = await page(clientA, cookieA);
  assert.doesNotMatch(clientPage, /Vista del cliente/);
  assert.doesNotMatch(clientPage, /Volver a administración/);
  assert.match(await page(clientB, cookieA), /Cliente no disponible/);
});

test("suspender cliente y usuario revoca el acceso inmediatamente", async () => {
  await request(
    "/api/admin",
    "POST",
    { action: "client-status", clientId: clientA, status: "suspended" },
    adminCookie,
  );
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    404,
  );
  await request(
    "/api/admin",
    "POST",
    { action: "client-status", clientId: clientA, status: "active" },
    adminCookie,
  );
  const id = (
    await getPool().query('SELECT id FROM "user" WHERE email=$1', [emailB])
  ).rows[0].id;
  await request(
    "/api/admin",
    "POST",
    { action: "user-status", userId: id, disabled: true },
    adminCookie,
  );
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientB}`,
        "GET",
        undefined,
        cookieB,
      )
    ).status,
    401,
  );
  const suspendedLogin = await request("/api/auth/sign-in/email", "POST", {
    email: emailB,
    password,
  });
  assert.notEqual(suspendedLogin.status, 200);
  await getPool().query('DELETE FROM "rateLimit"');
  await request(
    "/api/admin",
    "POST",
    { action: "user-status", userId: id, disabled: false },
    adminCookie,
  );
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientB}`,
        "GET",
        undefined,
        cookieB,
      )
    ).status,
    401,
  );
});
test("recuperación de contraseña usa correo, cambia clave y revoca sesiones", async () => {
  const r = await request("/api/auth/request-password-reset", "POST", {
    email: emailA,
    redirectTo: base + "/reset-password",
  });
  assert.equal(r.status, 200);
  for (let i = 0; i < 20 && !mail.length; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(mail.length);
  const text = mail[0].replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  const url = text.match(
    /http:\/\/127\.0\.0\.1:\d+\/api\/auth\/reset-password\/[^\s]+/,
  )?.[0];
  assert.ok(url, "correo contiene enlace de recuperación");
  assert.equal(new URL(url).origin, base);
  const bounce = await fetch(url, { redirect: "manual" });
  const destination = bounce.headers.get("location");
  assert.ok(destination);
  const resetToken = new URL(destination, base).searchParams.get("token");
  assert.ok(resetToken);
  const changed = await request("/api/auth/reset-password", "POST", {
    token: resetToken,
    newPassword: password + "new",
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    401,
  );
  assert.notEqual(
    (
      await request("/api/auth/sign-in/email", "POST", {
        email: emailA,
        password,
      })
    ).status,
    200,
  );
  cookieA = await login(emailA, password + "new");
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    200,
  );
  assert.notEqual(
    (
      await request("/api/auth/reset-password", "POST", {
        token: resetToken,
        newPassword: password,
      })
    ).status,
    200,
  );
});
test("cerrar sesión invalida la cookie", async () => {
  assert.equal(
    (await request("/api/auth/sign-out", "POST", {}, cookieA)).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/report?clientId=${clientA}`,
        "GET",
        undefined,
        cookieA,
      )
    ).status,
    401,
  );
});
