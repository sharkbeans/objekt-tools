"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDeviceLogin } from "@/hooks/use-device-login";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const [returnTo, setReturnTo] = useState("/");
  const { state, start } = useDeviceLogin();

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("returnTo");
    if (!value) return;

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        setReturnTo(`${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      if (value.startsWith("/")) setReturnTo(value);
    }
  }, []);

  useEffect(() => {
    if (state.status === "success") window.location.href = returnTo;
  }, [state.status, returnTo]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            A Discord account is required to post trades and send trade offers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white"
            onClick={() =>
              signIn.social({ provider: "discord", callbackURL: returnTo })
            }
          >
            Continue with Discord
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {state.status === "idle" || state.status === "requesting" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center">
                Already signed in on another device?
              </p>
              <Button
                variant="outline"
                onClick={start}
                disabled={state.status === "requesting"}
              >
                {state.status === "requesting" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Log in with a code"
                )}
              </Button>
            </div>
          ) : null}

          {state.status === "polling" ? (
            <div className="flex flex-col items-center gap-2 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">
                On your other device, go to
              </p>
              <p className="text-sm font-medium">{state.verificationUri}</p>
              <p className="text-sm text-muted-foreground">and enter:</p>
              <div className="text-2xl font-mono font-bold tracking-[0.2em] select-all">
                {state.userCode}
              </div>
              <Loader2 className="size-4 animate-spin text-muted-foreground mt-2" />
            </div>
          ) : null}

          {state.status === "denied" ? (
            <p className="text-center text-sm text-destructive">
              Login was denied on the other device.
            </p>
          ) : null}

          {state.status === "expired" ? (
            <p className="text-center text-sm text-destructive">
              Code expired.{" "}
              <button type="button" className="underline" onClick={start}>
                Try again
              </button>
            </p>
          ) : null}

          {state.status === "error" ? (
            <p className="text-center text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
