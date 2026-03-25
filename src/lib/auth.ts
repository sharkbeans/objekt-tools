import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
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
          if (!account || account.providerId !== "discord") return;

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
