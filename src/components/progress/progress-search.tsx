"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readStoredCosmoUsername,
  storeCosmoUsername,
} from "@/lib/cosmo-username-storage";
import type { ProgressIdentityResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

export type ProgressNavigationState = {
  nickname: string;
  phase: "resolving" | "opening";
} | null;

export const PROGRESS_NAVIGATION_EVENT = "progress-user-navigation";

export function ProgressSearch({
  defaultNickname,
  showLabel = true,
  placeholder = "e.g. sharkbeans",
  buttonLabel = "Search",
  buildHref,
  onNavigationChange,
}: {
  defaultNickname?: string;
  showLabel?: boolean;
  placeholder?: string;
  buttonLabel?: string;
  buildHref?: (nickname: string, data: ProgressIdentityResponse) => string;
  onNavigationChange?: (state: ProgressNavigationState) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultNickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function publishNavigation(state: ProgressNavigationState) {
    onNavigationChange?.(state);
    window.dispatchEvent(
      new CustomEvent<ProgressNavigationState>(PROGRESS_NAVIGATION_EVENT, {
        detail: state,
      }),
    );
  }

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
    if (
      defaultNickname &&
      trimmed.toLowerCase() === defaultNickname.toLowerCase()
    ) {
      setValue(defaultNickname);
      return;
    }
    let navigationStarted = false;
    setError(null);
    setChecking(true);
    publishNavigation({ nickname: trimmed, phase: "resolving" });
    try {
      const res = await fetch(
        `/api/progress/resolve/${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          res.status === 404
            ? "Cosmo user not found."
            : (body.error ?? "Failed to look up user. Try again."),
        );
        return;
      }
      const data: ProgressIdentityResponse = await res.json();
      storeCosmoUsername(data.nickname, data.address);
      const href = buildHref
        ? buildHref(data.nickname, data)
        : sectionHref(`/collection/${data.nickname}`, {
            currentSection: "collect",
          });
      const target = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (
        target.origin === current.origin &&
        target.pathname === current.pathname &&
        target.search === current.search
      ) {
        setValue(data.nickname);
        return;
      }

      publishNavigation({ nickname: data.nickname, phase: "opening" });
      router.push(href);
      navigationStarted = true;
    } catch {
      setError("Failed to look up user. Try again.");
    } finally {
      if (!navigationStarted) {
        setChecking(false);
        publishNavigation(null);
      }
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
            className="flex h-12 items-center justify-center gap-1.5 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {checking ? (
              "Searching..."
            ) : (
              <>
                <SearchIcon className="h-4 w-4" />
                {buttonLabel}
              </>
            )}
          </button>
        </div>
        <p className="t-error-msg mt-2 text-sm text-destructive">{error}</p>
      </div>
    </form>
  );
}
