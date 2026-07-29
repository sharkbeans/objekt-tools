import { createAuthEndpoint } from "@better-auth/core/api";
import { setSessionCookie } from "better-auth/cookies";

// Better Auth's `deviceAuthorization` plugin is RFC 8628: `/device/token`
// hands the polling device a bearer `access_token` (the raw, unsigned
// session token) — it deliberately never sets a browser cookie, since the
// spec targets CLI/API clients, not websites. This app is cookie-only
// (`requireSession()` reads the signed session cookie on every route), so
// the new device needs one more hop to turn that bearer token into a real
// session.
//
// This mirrors the bundled `oneTimeToken` plugin's own `/one-time-token/verify`
// endpoint almost exactly (same `findSession` + `setSessionCookie` shape) —
// it isn't a new pattern, just this app's version of the same bridge,
// built entirely on `better-auth`'s public plugin-authoring surface
// (`better-auth/plugins`, `better-auth/cookies`), not on internals.
export function deviceSessionBridge() {
  return {
    id: "device-session-bridge",
    endpoints: {
      claimDeviceSession: createAuthEndpoint(
        "/device/claim",
        { method: "POST" },
        async (ctx) => {
          const accessToken = ctx.body?.access_token;
          if (typeof accessToken !== "string" || !accessToken) {
            throw ctx.error("BAD_REQUEST", {
              message: "Missing access_token",
            });
          }

          const found =
            await ctx.context.internalAdapter.findSession(accessToken);
          if (!found || found.session.expiresAt < new Date()) {
            throw ctx.error("UNAUTHORIZED", { message: "Invalid session" });
          }

          await setSessionCookie(ctx, found);
          return ctx.json({ success: true });
        },
      ),
    },
  };
}
