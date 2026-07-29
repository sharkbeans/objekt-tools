"use client";

import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";

function normalizeUserCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

type DeviceApprovalState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "pending"; userCode: string }
  | { status: "approving"; userCode: string }
  | { status: "denying"; userCode: string }
  | { status: "approved" }
  | { status: "denied" }
  | { status: "error"; message: string };

/**
 * Drives the trusted-device half of the RFC 8628 device-authorization flow:
 * look up a user code, then approve or deny it. Shared by the /device page
 * (deep-linked from verification_uri_complete) and the in-app approval
 * dialog, which otherwise duplicate this exact request/state sequence.
 */
export function useDeviceApproval() {
  const [state, setState] = useState<DeviceApprovalState>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const checkCode = useCallback(async (raw: string) => {
    const userCode = normalizeUserCode(raw);
    if (!userCode) return;

    setState({ status: "checking" });
    const { data, error } = await authClient.device({
      query: { user_code: userCode },
    });

    if (error || !data) {
      setState({
        status: "error",
        message: error?.error_description ?? "Invalid or expired code.",
      });
      return;
    }

    if (data.status === "approved") {
      setState({ status: "approved" });
      return;
    }
    if (data.status === "denied") {
      setState({ status: "error", message: "This code was already denied." });
      return;
    }

    setState({ status: "pending", userCode });
  }, []);

  const approve = useCallback(async () => {
    if (state.status !== "pending") return;
    const { userCode } = state;

    setState({ status: "approving", userCode });
    const { error } = await authClient.device.approve({ userCode });
    setState(
      error
        ? {
            status: "error",
            message: error.error_description ?? "Failed to approve.",
          }
        : { status: "approved" },
    );
  }, [state]);

  const deny = useCallback(async () => {
    if (state.status !== "pending") return;
    const { userCode } = state;

    setState({ status: "denying", userCode });
    const { error } = await authClient.device.deny({ userCode });
    setState(
      error
        ? {
            status: "error",
            message: error.error_description ?? "Failed to deny.",
          }
        : { status: "denied" },
    );
  }, [state]);

  return { state, checkCode, approve, deny, reset };
}
