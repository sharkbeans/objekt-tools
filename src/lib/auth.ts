import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { deviceSessionBridge } from "./auth-device-session";
import { db } from "./db";
import * as schema from "./db/schema";
import { allOrigins, rootDomain, rootUrl, subdomainsEnabled } from "./sections";

function getDiscordProviderConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return undefined;
  }

  return {
    discord: {
      clientId,
      clientSecret,
    },
  };
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: subdomainsEnabled()
      ? allOrigins()
      : [process.env.BETTER_AUTH_URL ?? "https://objekt.my"],
    // Sessions (and the OAuth state cookie — sign-in can start on a subdomain
    // and complete at the root-domain callback) must be readable on every
    // section host.
    ...(subdomainsEnabled()
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: `.${rootDomain()}`,
            },
          },
        }
      : {}),
    socialProviders: getDiscordProviderConfig(),
    // Explicit rather than inherited: the middleware cookie-migration shim
    // hardcodes the same 7 days, and the two must agree.
    session: {
      expiresIn: 60 * 60 * 24 * 7,
    },
    // Backstop for the device-authorization endpoints (/device/approve and
    // /device/token). The plugin already enforces its own poll interval via
    // `slow_down`; this caps everything else.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
    },
    plugins: [
      // RFC 8628. Replaces the previous hand-rolled 6-digit login-code flow:
      // a short code is worthless on its own here because /device/approve
      // requires an authenticated session before it will bind the code to an
      // account.
      deviceAuthorization({
        expiresIn: "10m",
        interval: "5s",
        userCodeLength: 8,
        verificationUri: `${rootUrl()}/device`,
      }),
      // Converts the bearer access_token from /device/token into a real
      // session cookie — see auth-device-session.ts for why this hop exists.
      deviceSessionBridge(),
    ],
    databaseHooks: {
      session: {
        create: {
          // After every sign-in, sync the Discord username from the account table
          // onto the user row so it's always up to date without a join.
          after: async (session) => {
            const account = await db.query.account.findFirst({
              where: eq(schema.account.userId, session.userId),
              columns: { accountId: true, providerId: true },
            });
            if (account?.providerId !== "discord") return;

            // Discord's accountId is the snowflake ID; username is stored in user.name
            // by Better Auth automatically. We just need to copy them to our columns.
            const userRow = await db.query.user.findFirst({
              where: eq(schema.user.id, session.userId),
              columns: { name: true, discordId: true },
            });
            if (!userRow) return;

            // Only update if discordId not yet set or changed
            if (userRow.discordId !== account.accountId) {
              await db
                .update(schema.user)
                .set({
                  discordId: account.accountId,
                  discordUsername: userRow.name,
                  updatedAt: new Date(),
                })
                .where(eq(schema.user.id, session.userId));
            }
          },
        },
      },
    },
  });
}

type AppAuth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & {
  _auth?: AppAuth;
};

function getAuth(): AppAuth {
  if (!globalForAuth._auth) {
    globalForAuth._auth = createAuth();
  }

  return globalForAuth._auth;
}

export const auth = new Proxy({} as AppAuth, {
  get(_target, prop, _receiver) {
    const instance = getAuth();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return prop in getAuth();
  },
});
