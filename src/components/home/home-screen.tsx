"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type React from "react";
import { useState, useSyncExternalStore } from "react";
import { ProgressSearch } from "@/components/progress/progress-search";
import type { Showcase } from "@/lib/home/showcase";
import { cn } from "@/lib/utils";
import { GridShowcase } from "./grid-showcase";
import styles from "./home.module.css";
import { MatchShowcase } from "./match-showcase";

type LinkCopy = { label: string; href: string };

export type HomeCopy = {
  intro: { title: string; body: string };
  grids: {
    word: string;
    title: string;
    body: string;
    searchPlaceholder: string;
    searchButton: string;
    linkPrompt: string;
    link: LinkCopy;
  };
  match: {
    word: string;
    title: string;
    body: string;
    primary: LinkCopy;
    secondary: LinkCopy;
  };
};

export type HomeTool = {
  id: string;
  label: string;
  description: string;
  href: string;
  /** A lucide icon element; the tile sets its size and colour. */
  icon: React.ReactNode;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

async function fetchShowcase(): Promise<Showcase | null> {
  const response = await fetch("/api/home/showcase");
  if (!response.ok) return null;
  const body = (await response.json()) as { showcase: Showcase | null };
  return body.showcase;
}

type Panel = "grids" | "match";

/**
 * Publishes the height of a step's text as --copy-h on its panel, so the
 * art can use exactly the space above it. A callback ref with cleanup.
 */
function trackCopyHeight(el: HTMLDivElement | null) {
  const panel = el?.parentElement;
  if (!el || !panel) return;
  const update = () =>
    panel.style.setProperty("--copy-h", `${Math.ceil(el.offsetHeight)}px`);
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * The home screen as a path for someone new: one line on what the site is
 * for, then the two steps side by side. The first (see what your grids are
 * missing) starts selected and holds the Cosmo name search, so the first
 * thing to do is right there; the second is finding who has those objekts on
 * Discord. The other tools sit underneath.
 */
export function HomeScreen({
  copy,
  tools,
}: {
  copy: HomeCopy;
  tools: HomeTool[];
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<Panel>("grids");
  const { data: showcase } = useQuery({
    queryKey: ["home-showcase"],
    queryFn: fetchShowcase,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const selectProps = (panel: Panel) => ({
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") setActive(panel);
    },
    onFocus: () => setActive(panel),
  });

  return (
    <div className={styles.screen}>
      <header className={styles.intro}>
        <h1 className={styles.introTitle}>{copy.intro.title}</h1>
        <p className={styles.introBody}>{copy.intro.body}</p>
      </header>

      <div className={styles.showcase}>
        <section
          className={styles.panel}
          data-active={active === "grids" || undefined}
          aria-labelledby="step-grids"
          {...selectProps("grids")}
        >
          <div className={styles.backdrop} aria-hidden>
            <div
              className={styles.table}
              data-ready={showcase ? true : undefined}
            >
              {showcase && (
                <GridShowcase grid={showcase.grid} reduce={reduce} />
              )}
            </div>
            <div className={styles.shade} />
            <p className={styles.ghost}>{copy.grids.word}</p>
          </div>
          <div ref={trackCopyHeight} className={styles.copy}>
            <h2 id="step-grids" className={styles.title}>
              {copy.grids.title}
            </h2>
            <p className={styles.body}>{copy.grids.body}</p>
            <div className={styles.search}>
              <ProgressSearch
                showLabel={false}
                placeholder={copy.grids.searchPlaceholder}
                buttonLabel={copy.grids.searchButton}
              />
            </div>
            <p className={styles.aside}>
              {copy.grids.linkPrompt}{" "}
              <Link href={copy.grids.link.href} className={styles.inlineLink}>
                {copy.grids.link.label}
              </Link>
            </p>
          </div>
        </section>

        <section
          className={styles.panel}
          data-active={active === "match" || undefined}
          aria-labelledby="step-match"
          {...selectProps("match")}
        >
          <div className={styles.backdrop} aria-hidden>
            <div
              className={styles.table}
              data-ready={showcase ? true : undefined}
            >
              {showcase && (
                <MatchShowcase
                  mine={showcase.mine}
                  theirs={showcase.theirs}
                  reduce={reduce}
                />
              )}
            </div>
            <div className={styles.shade} />
            <p className={styles.ghost}>{copy.match.word}</p>
          </div>
          <Link
            href={copy.match.primary.href}
            className={styles.panelLink}
            aria-label={copy.match.primary.label}
            tabIndex={-1}
          />
          <div ref={trackCopyHeight} className={styles.copy}>
            <h2 id="step-match" className={styles.title}>
              {copy.match.title}
            </h2>
            <p className={styles.body}>{copy.match.body}</p>
            <div className={styles.actions}>
              <Link
                href={copy.match.primary.href}
                className={cn(styles.button, styles.primary)}
              >
                {copy.match.primary.label}
              </Link>
              <Link
                href={copy.match.secondary.href}
                className={cn(styles.button, styles.secondary)}
              >
                {copy.match.secondary.label}
              </Link>
            </div>
          </div>
        </section>
      </div>

      <nav className={styles.tiles} aria-label="More tools">
        {tools.map((tool) => (
          <Link key={tool.id} href={tool.href} className={styles.tile}>
            <span className={styles.tileIcon} aria-hidden>
              {tool.icon}
            </span>
            <span className={styles.tileText}>
              <span className={styles.tileLabel}>{tool.label}</span>
              <span className={styles.tileDesc}>{tool.description}</span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
