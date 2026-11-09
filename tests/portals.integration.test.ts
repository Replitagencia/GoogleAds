import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { SMTPServer } from "smtp-server";
import { get as httpGet } from "node:http";
import { getPool } from "../db";
const agency = process.env.SITE_URL!;
const client = process.env.CLIENT_SITE_URL!;
if (
  !process.env.DATABASE_URL?.includes("agencialabs_test") ||
  agency !== "http://127.0.0.1:3402" ||
  client !== "http://localhost:3402"
)
  throw Error("Solo pruebas locales de dos portales.");
const password = randomBytes(20).toString("base64url");
const suffix = randomUUID();
const adminEmail = `portals-admin-${suffix}@example.test`;
const clientEmail = `portals-client-${suffix}@example.test`;
const companyId = randomUUID();
let adminCookie = "",
  clientCookie = "";
const mail: string[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"],
  onData(stream, session, callback) {
    let message = "";
    stream.on("data", (chunk) => (message += chunk));
    stream.on("end", () => {
      mail.push(message);
      callback();
    });
  },
});
async function request(
  origin: string,
  path: string,
  options: {
    cookie?: string;
    body?: unknown;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return fetch(origin + path, {
    method: options.body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      "x-real-ip": "127.0.0.9",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            Origin: options.origin || origin,
          }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}
async function login(origin: string, email: string) {
  const r = await request(origin, "/api/auth/sign-in/email", {
    body: { email, password },
  });
  assert.equal(r.status, 200);
  assert.ok(
    r.headers.getSetCookie().every((c) => !/(^|;)\s*domain=/i.test(c)),
    "Cookies limitadas al host",
  );
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
before(async () => {
  await new Promise<void>((resolve) => smtp.listen(1026, "127.0.0.1", resolve));
  const db = getPool();
  await db.query('DELETE FROM "rateLimit"');
  await db.query(
    "INSERT INTO clients(id,name) VALUES($1,'Empresa de prueba de dominios')",
    [companyId],
  );
  for (const [email, isAdmin] of [
    [adminEmail, true],
    [clientEmail, false],
  ] as const) {
    const id = randomUUID();
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$2,true,now(),now())',
      [id, email],
    );
    await db.query(
      'INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',
      [randomUUID(), id, await hashPassword(password)],
    );
    await db.query("INSERT INTO portal_users(user_id,is_admin) VALUES($1,$2)", [
      id,
      isAdmin,
    ]);
    if (!isAdmin)
      await db.query(
        "INSERT INTO memberships(user_id,client_id) VALUES($1,$2)",
        [id, companyId],
      );
  }
  adminCookie = await login(agency, adminEmail);
  clientCookie = await login(client, clientEmail);
});
after(async () => {
  await new Promise<void>((resolve) => smtp.close(() => resolve()));
  await getPool().end();
});
test("cada dominio muestra su entrada y no confía en hosts reenviados", async () => {
  assert.match(
    await (await request(agency, "/login")).text(),
    /Administración de clientes/,
  );
  assert.match(
    await (await request(client, "/login")).text(),
    /Tus campañas, en un lugar/,
  );
  assert.match(
    await (
      await request(agency, "/login", {
        headers: { "x-forwarded-host": "localhost:3402" },
      })
    ).text(),
    /Administración de clientes/,
  );
  // fetch normalizes Host; use the HTTP transport to test the actual wire header.
  const unknownHostStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      httpGet(
        agency + "/api/auth/get-session",
        { headers: { Host: "untrusted.invalid" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      ).on("error", reject);
    },
  );
  assert.equal(unknownHostStatus, 400);
});
test("roles y sesiones no se pueden intercambiar entre portales", async () => {
  assert.equal(
    (await request(agency, "/api/admin", { cookie: adminCookie })).status,
    200,
  );
  assert.equal(
    (
      await request(client, `/api/google/status?clientId=${companyId}`, {
        cookie: clientCookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(client, "/api/admin", { cookie: clientCookie })).status,
    403,
  );
  assert.equal(
    (
      await request(agency, "/api/admin", {
        cookie: clientCookie.replaceAll("agencialabs-client.", "agencialabs."),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(client, `/api/google/status?clientId=${companyId}`, {
        cookie: adminCookie.replaceAll("agencialabs.", "agencialabs-client."),
      })
    ).status,
    401,
  );
  assert.notEqual(
    (
      await request(agency, "/api/auth/sign-in/email", {
        body: { email: clientEmail, password },
      })
    ).status,
    200,
  );
  assert.notEqual(
    (
      await request(client, "/api/auth/sign-in/email", {
        body: { email: adminEmail, password },
      })
    ).status,
    200,
  );
});
test("invitación y activación de clientes pertenecen al dominio cliente", async () => {
  const r = await request(agency, "/api/admin", {
    cookie: adminCookie,
    body: {
      action: "invite",
      email: `new-${suffix}@example.test`,
      clientId: companyId,
    },
  });
  assert.equal(r.status, 200);
  const { url } = await r.json();
  assert.equal(new URL(url).origin, client);
  const token = new URL(url).searchParams.get("token")!;
  assert.equal(
    (await request(agency, "/api/invitations?token=" + token)).status,
    403,
  );
  assert.equal(
    (await request(client, "/api/invitations?token=" + token)).status,
    200,
  );
  const body = { token, name: "Nuevo cliente", password };
  assert.equal(
    (await request(client, "/api/invitations", { body, origin: agency }))
      .status,
    403,
  );
  assert.equal(
    (await request(client, "/api/invitations", { body })).status,
    200,
  );
});
test("recuperación de cliente usa su dominio y no envía enlaces de administradores", async () => {
  const reset = await request(client, "/api/auth/request-password-reset", {
    body: { email: clientEmail, redirectTo: client + "/reset-password" },
  });
  assert.equal(reset.status, 200);
  assert.equal(mail.length, 1);
  assert.ok(mail[0].includes(client));
  await request(client, "/api/auth/request-password-reset", {
    body: { email: adminEmail, redirectTo: client + "/reset-password" },
  });
  assert.equal(mail.length, 1);
});

test("un miembro de agencia con empresa asignada puede usar ambos portales sin privilegios de agencia en el portal de cliente", async () => {
  const db = getPool();
  await db.query(
    'UPDATE portal_users SET is_admin=true WHERE user_id=(SELECT id FROM "user" WHERE email=$1)',
    [clientEmail],
  );
  const otherId = randomUUID();
  await db.query(
    "INSERT INTO clients(id,name) VALUES($1,'Otra empresa de prueba')",
    [otherId],
  );
  await db.query('DELETE FROM "rateLimit"');
  const agencyAccess = await login(agency, clientEmail);
  const clientAccess = await login(client, clientEmail);
  assert.equal(
    (await request(agency, "/api/admin", { cookie: agencyAccess })).status,
    200,
  );
  assert.equal(
    (await request(client, "/api/admin", { cookie: clientAccess })).status,
    403,
  );
  assert.equal(
    (
      await request(client, `/api/google/status?clientId=${companyId}`, {
        cookie: clientAccess,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(client, `/api/google/status?clientId=${otherId}`, {
        cookie: clientAccess,
      })
    ).status,
    404,
  );
  const page = await (
    await request(client, `/?clientId=${companyId}`, { cookie: clientAccess })
  ).text();
  assert.ok(!page.includes("Configurar cuenta"));
  assert.ok(!page.includes("Administrar clientes"));
});
