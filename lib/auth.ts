import { betterAuth } from "better-auth";
import { getPool } from "../db";
import { sendPasswordReset } from "./mail";
import {
  configuredPortals,
  roleMatchesPortal,
  type PortalConfig,
} from "./portals";
const instances = new Map<string, ReturnType<typeof createAuth>>();
function createAuth(portal: PortalConfig) {
  if (!process.env.SITE_URL || !process.env.BETTER_AUTH_SECRET)
    throw new Error("Falta configurar la autenticación del portal.");
  return betterAuth({
    appName: "AgenciaLabs",
    baseURL: portal.origin,
    secret: process.env.BETTER_AUTH_SECRET,
    database: getPool(),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const { rows } = await getPool().query(
              "SELECT disabled,is_admin,EXISTS (SELECT 1 FROM memberships m JOIN clients c ON c.id=m.client_id WHERE m.user_id=portal_users.user_id AND c.status='active') AS has_client_access FROM portal_users WHERE user_id=$1",
              [session.userId],
            );
            if (
              !rows[0] ||
              rows[0].disabled ||
              !roleMatchesPortal(
                portal,
                rows[0].is_admin,
                rows[0].has_client_access,
              )
            )
              return false;
            return { data: session };
          },
        },
      },
    },
    trustedOrigins: [portal.origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { rows } = await getPool().query(
          "SELECT is_admin,disabled,EXISTS (SELECT 1 FROM memberships m JOIN clients c ON c.id=m.client_id WHERE m.user_id=portal_users.user_id AND c.status='active') AS has_client_access FROM portal_users WHERE user_id=$1",
          [user.id],
        );
        if (
          !rows[0] ||
          rows[0].disabled ||
          !roleMatchesPortal(
            portal,
            rows[0].is_admin,
            rows[0].has_client_access,
          )
        )
          return;
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
      cookiePrefix:
        portal.audience === "client" ? "agencialabs-client" : "agencialabs",
      useSecureCookies: portal.origin.startsWith("https:"),
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
  });
}

export function getAuth(portal: PortalConfig = configuredPortals()[0]) {
  const key = portal.origin + ":" + portal.audience;
  let instance = instances.get(key);
  if (!instance) {
    instance = createAuth(portal);
    instances.set(key, instance);
  }
  return instance;
}
