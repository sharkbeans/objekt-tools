"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readStoredCosmoUsername,
  storeCosmoUsername,
} from "@/lib/cosmo-username-storage";
import {
  MIN_SUGGEST_LENGTH,
  type ProgressSuggestResponse,
} from "@/lib/progress/suggest";
import type { ProgressIdentityResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

export type ProgressNavigationState = {
  nickname: string;
  phase: "resolving" | "opening";
} | null;

export const PROGRESS_NAVIGATION_EVENT = "progress-user-navigation";

/** Long enough that a burst of typing settles into one request. */
const SUGGEST_DEBOUNCE_MS = 400;

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
  const [suggestions, setSuggestions] = useState<ProgressIdentityResponse[]>(
    [],
  );
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Holds a value that arrived for a reason that shouldn't re-query — a
  // prefill, or picking a suggestion. Storing the value rather than a flag
  // means a set that React bails out of can't swallow a later real query.
  const skipSuggestRef = useRef<string | null>(null);

  const publishNavigation = useCallback(
    (state: ProgressNavigationState) => {
      onNavigationChange?.(state);
      window.dispatchEvent(
        new CustomEvent<ProgressNavigationState>(PROGRESS_NAVIGATION_EVENT, {
          detail: state,
        }),
      );
    },
    [onNavigationChange],
  );

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
    if (saved) {
      skipSuggestRef.current = saved;
      setValue(saved);
    }
  }, [defaultNickname]);

  const closeSuggestions = useCallback(() => {
    setSuggestOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const trimmed = value.trim();
    if (skipSuggestRef.current === trimmed) {
      skipSuggestRef.current = null;
      setSuggestions([]);
      closeSuggestions();
      return;
    }
    if (
      trimmed.length < MIN_SUGGEST_LENGTH ||
      (defaultNickname &&
        trimmed.toLowerCase() === defaultNickname.toLowerCase())
    ) {
      setSuggestions([]);
      closeSuggestions();
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/progress/suggest?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data: ProgressSuggestResponse = await res.json();
        // Only ever replace the list wholesale, never blank it mid-flight —
        // an empty frame between two result sets reads as a flicker.
        setSuggestions(data.results ?? []);
        setActiveIndex(-1);
        setSuggestOpen((data.results ?? []).length > 0);
      } catch {
        // Aborted or offline — leave whatever is on screen alone.
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, defaultNickname, closeSuggestions]);

  const openIdentity = useCallback(
    (data: ProgressIdentityResponse) => {
      storeCosmoUsername(data.nickname, data.address);
      const href = buildHref
        ? buildHref(data.nickname, data)
        : sectionHref(`/collection/${encodeURIComponent(data.nickname)}`, {
            currentSection: "collect",
          });
      const target = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (
        target.origin === current.origin &&
        target.pathname === current.pathname &&
        target.search === current.search
      ) {
        skipSuggestRef.current = data.nickname;
        setValue(data.nickname);
        return false;
      }

      publishNavigation({ nickname: data.nickname, phase: "opening" });
      router.push(href);
      return true;
    },
    [buildHref, router, publishNavigation],
  );

  function selectSuggestion(suggestion: ProgressIdentityResponse) {
    if (checking) return;
    skipSuggestRef.current = suggestion.nickname;
    setValue(suggestion.nickname);
    setSuggestions([]);
    closeSuggestions();
    setError(null);
    setChecking(true);
    publishNavigation({ nickname: suggestion.nickname, phase: "resolving" });
    // The suggestion already carries the resolved address, so this skips the
    // /resolve round trip the typed path needs.
    if (!openIdentity(suggestion)) {
      setChecking(false);
      publishNavigation(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      closeSuggestions();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || checking) return;
    closeSuggestions();
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
      navigationStarted = openIdentity(data);
    } catch {
      setError("Failed to look up user. Try again.");
    } finally {
      if (!navigationStarted) {
        setChecking(false);
        publishNavigation(null);
      }
    }
  }

  const showSuggestions = suggestOpen && suggestions.length > 0 && !checking;

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
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              id="progress-search-nickname"
              type="text"
              value={value}
              aria-invalid={!!error}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="progress-search-suggestions"
              aria-activedescendant={
                showSuggestions && activeIndex >= 0
                  ? `progress-search-suggestion-${activeIndex}`
                  : undefined
              }
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setSuggestOpen(true);
              }}
              onBlur={closeSuggestions}
              placeholder={placeholder}
              maxLength={30}
              className={cn(
                "t-input h-12 w-full bg-background text-base md:text-base",
                error && "is-error",
              )}
            />
            {showSuggestions && (
              <div
                id="progress-search-suggestions"
                role="listbox"
                className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md duration-150 animate-in fade-in-0 slide-in-from-top-1"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.address}
                    type="button"
                    id={`progress-search-suggestion-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Fire before the input's blur closes the list.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
                    className={cn(
                      "block w-full truncate px-3 py-2 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {suggestion.nickname}
                  </button>
                ))}
              </div>
            )}
          </div>
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
