import { betterAuth } from "better-auth";
import { getPool } from "../db";
import { sendPasswordReset } from "./mail";
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  if (!process.env.SITE_URL || !process.env.BETTER_AUTH_SECRET)
    throw new Error("Falta configurar la autenticación del portal.");
  return betterAuth({
    appName: "AgenciaLabs",
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: getPool(),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const { rows } = await getPool().query(
              "SELECT disabled FROM portal_users WHERE user_id=$1",
              [session.userId],
            );
            if (!rows[0] || rows[0].disabled) return false;
            return { data: session };
          },
        },
      },
    },
    trustedOrigins: [process.env.SITE_URL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordReset(user.email, url);
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 12,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "agencialabs",
      useSecureCookies: process.env.SITE_URL.startsWith("https:"),
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
  });
}

export function getAuth() {
  return (instance ??= createAuth());
}
