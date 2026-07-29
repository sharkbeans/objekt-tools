"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

// Not an OAuth client registry — this app has exactly one client (its own
// web frontend) and never configured `validateClient`, so any non-empty
// string satisfies the RFC 8628 `client_id` field.
const CLIENT_ID = "web";

type DeviceLoginState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "polling"; userCode: string; verificationUri: string }
  | { status: "success" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "error"; message: string };

/**
 * Drives the new-device half of the RFC 8628 flow: request a code, poll for
 * approval, then bridge the resulting bearer token into a real session
 * cookie via our own /device/claim endpoint (see auth-device-session.ts —
 * /device/token alone only ever returns a bearer token, by design).
 */
export function useDeviceLogin() {
  const [state, setState] = useState<DeviceLoginState>({ status: "idle" });
  const deviceCodeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const poll = useCallback(async (intervalMs: number) => {
    if (stoppedRef.current || !deviceCodeRef.current) return;

    const { data, error } = await authClient.device.token({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCodeRef.current,
      client_id: CLIENT_ID,
    });

    if (stoppedRef.current) return;

    if (error) {
      if (error.error === "authorization_pending") {
        timerRef.current = setTimeout(() => poll(intervalMs), intervalMs);
        return;
      }
      if (error.error === "slow_down") {
        const next = intervalMs + 5000;
        timerRef.current = setTimeout(() => poll(next), next);
        return;
      }
      if (error.error === "expired_token") {
        setState({ status: "expired" });
        return;
      }
      if (error.error === "access_denied") {
        setState({ status: "denied" });
        return;
      }
      setState({
        status: "error",
        message: error.error_description ?? "Login failed.",
      });
      return;
    }

    if (!data?.access_token) {
      setState({ status: "error", message: "Login failed." });
      return;
    }

    // /device/token only ever returns a bearer token (see the comment atop
    // this file) — this app is cookie-only, so one more call turns it into
    // a real session. Plain fetch, not the generated client: this endpoint
    // is app-specific (auth-device-session.ts), not part of the
    // deviceAuthorization plugin's own typed surface.
    const claimRes = await fetch("/api/auth/device/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: data.access_token }),
    });
    if (stoppedRef.current) return;

    if (!claimRes.ok) {
      setState({
        status: "error",
        message: "Failed to establish session.",
      });
      return;
    }

    setState({ status: "success" });
  }, []);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    setState({ status: "requesting" });

    const { data, error } = await authClient.device.code({
      client_id: CLIENT_ID,
    });

    if (error || !data) {
      setState({
        status: "error",
        message: error?.error_description ?? "Failed to start login.",
      });
      return;
    }

    deviceCodeRef.current = data.device_code;
    setState({
      status: "polling",
      userCode: data.user_code,
      verificationUri: data.verification_uri,
    });

    const intervalMs = data.interval * 1000;
    timerRef.current = setTimeout(() => poll(intervalMs), intervalMs);
  }, [poll]);

  return { state, start };
}
