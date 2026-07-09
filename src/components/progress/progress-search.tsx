"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProgressOverviewResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";

const LAST_NICKNAME_KEY = "progress-last-nickname";

export function ProgressSearch({
  defaultNickname,
}: {
  defaultNickname?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(defaultNickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (defaultNickname) return;
    const saved = localStorage.getItem(LAST_NICKNAME_KEY);
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
      localStorage.setItem(LAST_NICKNAME_KEY, trimmed);
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
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Cosmo nickname"
          maxLength={30}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={checking}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {checking ? "Searching..." : "Search"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
