"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LoginCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginCodeDialog({ open, onOpenChange }: LoginCodeDialogProps) {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);

  const generateCode = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-code/generate", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to generate code");
        return;
      }
      const data = await res.json();
      setCode(data.code);
      setSecondsLeft(data.expiresIn);
    } catch {
      toast.error("Failed to generate code");
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate code when dialog opens
  useEffect(() => {
    if (open) {
      generateCode();
    } else {
      setCode(null);
      setSecondsLeft(0);
    }
  }, [open, generateCode]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Login Code</DialogTitle>
          <DialogDescription>
            Enter this code on another device to log in as your account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {loading ? (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          ) : code ? (
            <>
              <div className="text-4xl font-mono font-bold tracking-[0.3em] select-all">
                {code}
              </div>
              <p className="text-sm text-muted-foreground">
                Expires in {minutes}:{String(seconds).padStart(2, "0")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Code expired</p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={generateCode}
            disabled={loading}
          >
            <RefreshCw className="size-4 mr-2" />
            Generate new code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
