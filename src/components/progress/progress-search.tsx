"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readStoredCosmoUsername,
  storeCosmoUsername,
} from "@/lib/cosmo-username-storage";
import type { ProgressOverviewResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

export function ProgressSearch({
  defaultNickname,
  showLabel = true,
  placeholder = "e.g. sharkbeans",
  buttonLabel = "Search",
}: {
  defaultNickname?: string;
  showLabel?: boolean;
  placeholder?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(defaultNickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!error) return;
    const el = inputRef.current;
    if (!el) return;
    el.classList.remove("is-shaking");
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add("is-shaking");
  }, [error]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (defaultNickname) return;
    const saved = readStoredCosmoUsername();
    if (saved) setValue(saved);
  }, [defaultNickname]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || checking) return;
    setError(null);
    setChecking(true);
    try {
      const res = await fetch(`/api/progress/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          res.status === 404
            ? "Cosmo user not found."
            : (body.error ?? "Failed to look up user. Try again."),
        );
        return;
      }
      const data: ProgressOverviewResponse = await res.json();
      queryClient.setQueryData(["progress", trimmed], data);
      storeCosmoUsername(data.nickname);
      router.push(
        sectionHref(`/collection/${trimmed}`, { currentSection: "collect" }),
      );
    } catch {
      setError("Failed to look up user. Try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {showLabel && (
        <Label
          htmlFor="progress-search-nickname"
          className="text-sm font-medium"
        >
          Cosmo Username
        </Label>
      )}
      <div className={cn("t-input-wrap", error && "is-error")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id="progress-search-nickname"
            type="text"
            value={value}
            aria-invalid={!!error}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={placeholder}
            maxLength={30}
            className={cn(
              "t-input h-12 flex-1 bg-background text-base md:text-base",
              error && "is-error",
            )}
          />
          <button
            type="submit"
            disabled={checking}
            className="h-12 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {checking ? "Searching..." : buttonLabel}
          </button>
        </div>
        <p className="t-error-msg mt-2 text-sm text-destructive">{error}</p>
      </div>
    </form>
  );
}
