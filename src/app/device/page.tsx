"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDeviceApproval } from "@/hooks/use-device-approval";
import { useSession } from "@/lib/auth-client";

export default function DevicePage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const { state, checkCode, approve, deny, reset } = useDeviceApproval();
  const [input, setInput] = useState("");
  const checkedFromUrl = useRef(false);

  // Redirect unauthenticated visitors, preserving the code so they land
  // straight back here — approval itself requires a session either way.
  useEffect(() => {
    if (sessionPending || session) return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }, [sessionPending, session, router]);

  // Deep link from verification_uri_complete: /device?user_code=XXXXXXXX
  useEffect(() => {
    if (!session || checkedFromUrl.current) return;
    const fromUrl = new URLSearchParams(window.location.search).get(
      "user_code",
    );
    if (fromUrl) {
      checkedFromUrl.current = true;
      setInput(fromUrl);
      checkCode(fromUrl);
    }
  }, [session, checkCode]);

  if (sessionPending || !session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Log in on another device</CardTitle>
          <CardDescription>
            Enter the code shown on the other device to sign it in as{" "}
            {session.user.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.status === "idle" || state.status === "checking" ? (
            <>
              <Input
                autoFocus
                inputMode="text"
                maxLength={9}
                placeholder="ABCD1234"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="font-mono text-center text-lg tracking-widest uppercase"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input) checkCode(input);
                }}
              />
              <Button
                onClick={() => checkCode(input)}
                disabled={!input || state.status === "checking"}
              >
                {state.status === "checking" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Continue"
                )}
              </Button>
            </>
          ) : null}

          {state.status === "pending" ||
          state.status === "approving" ||
          state.status === "denying" ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Approve login for code{" "}
                <span className="font-mono font-semibold">
                  {state.userCode}
                </span>
                ?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={deny}
                  disabled={state.status !== "pending"}
                >
                  {state.status === "denying" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Deny"
                  )}
                </Button>
                <Button
                  className="flex-1"
                  onClick={approve}
                  disabled={state.status !== "pending"}
                >
                  {state.status === "approving" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Approve"
                  )}
                </Button>
              </div>
            </>
          ) : null}

          {state.status === "approved" ? (
            <p className="text-center text-sm text-muted-foreground">
              The other device is now signed in. You can close this page.
            </p>
          ) : null}

          {state.status === "denied" ? (
            <p className="text-center text-sm text-muted-foreground">
              Login denied.
            </p>
          ) : null}

          {state.status === "error" ? (
            <>
              <p className="text-center text-sm text-destructive">
                {state.message}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setInput("");
                  reset();
                }}
              >
                Try again
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
