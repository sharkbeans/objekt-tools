import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import { allOrigins, rootDomain, subdomainsEnabled } from "./sections";

function getRequiredEnv(name: "DISCORD_CLIENT_ID" | "DISCORD_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const auth = betterAuth({
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
  socialProviders: {
    discord: {
      clientId: getRequiredEnv("DISCORD_CLIENT_ID"),
      clientSecret: getRequiredEnv("DISCORD_CLIENT_SECRET"),
    },
  },
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
