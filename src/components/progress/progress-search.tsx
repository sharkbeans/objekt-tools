"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LAST_NICKNAME_KEY = "progress-last-nickname";

export function ProgressSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(LAST_NICKNAME_KEY);
    if (saved) setValue(saved);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    localStorage.setItem(LAST_NICKNAME_KEY, trimmed);
    router.push(`/progress/${trimmed}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cosmo nickname"
        maxLength={30}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
