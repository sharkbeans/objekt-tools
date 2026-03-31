"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignInDialog({ open, onOpenChange }: SignInDialogProps) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function handleCodeLogin() {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/login-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to verify code");
        setCode("");
        return;
      }
      toast.success("Logged in successfully");
      window.location.reload();
    } catch {
      toast.error("Failed to verify code");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>
            A Discord account is required to send trade offers.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white"
            onClick={() =>
              signIn.social({
                provider: "discord",
                callbackURL: window.location.href,
              })
            }
          >
            Continue with Discord
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground text-center">
              Have a login code? Enter it below.
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setCode(val);
                }}
                className="font-mono text-center tracking-widest"
              />
              <Button
                onClick={handleCodeLogin}
                disabled={code.length !== 6 || verifying}
              >
                {verifying ? <Loader2 className="size-4 animate-spin" /> : "Login"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
