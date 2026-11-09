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
  assert.equal(tasks.length, 7);
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
