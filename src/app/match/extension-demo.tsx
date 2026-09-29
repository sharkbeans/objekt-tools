"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * What the extension does, as three steps that each own one recording. The
 * recordings are dense screenshots, so they get one large stage rather than
 * three thumbnails side by side. They play one after another, each step's bar
 * filling as its clip runs, and picking a step jumps to it. Every clip is cut
 * 16:9, so the stage keeps its height whichever step is showing.
 */
interface DemoStep {
  id: string;
  title: string;
  body: string;
  /** H.264 MP4, looping, no audio. */
  video: string;
  /** The clip's first frame: shown while it loads and to anyone who prefers
   * reduced motion, and identical to where the clip starts. */
  poster: string;
  alt: string;
  /** What the recording shows, when that needs saying. */
  caption?: ReactNode;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "collect",
    title: "Collect posts from Discord",
    body: "Scroll your trade channel like normal. Objekt Match remembers every post you pass.",
    video: "/extension/discord-search.mp4",
    poster: "/extension/discord-search-poster.webp",
    alt: "The Objekt Match panel next to Discord, collecting trade posts that mention SeoYeon CC101 to CC108.",
    caption: (
      <>
        This clip shows the optional search mode, which types your missing codes
        into Discord’s search box for you. Collecting as you scroll needs none
        of that.{" "}
        <Link
          href="/extension#search-mode"
          target="_blank"
          className="underline underline-offset-4 hover:text-foreground"
        >
          What search mode does
        </Link>
      </>
    ),
  },
  {
    id: "match",
    title: "See who has your missing cards",
    body: "Press Open in match. Posts line up against your collection, and picking a card narrows them to the traders who have it.",
    video: "/extension/match-results.mp4",
    poster: "/extension/match-results-poster.webp",
    alt: "Picking a card in Objekt Match narrows the other side to the traders who have it, then the page scrolls down to the list of traders to contact.",
  },
  {
    id: "jump",
    title: "Jump to their post",
    body: "One click takes you to that exact message in Discord, ready to reply.",
    video: "/extension/jump-to-message.mp4",
    poster: "/extension/jump-to-message-poster.webp",
    alt: "Pressing Jump to message on a trader in Objekt Match opens Discord scrolled to their post, with the message highlighted.",
  },
];

/** The active step's fill bar; the playing clip moves it. */
export type StepProgress = RefObject<HTMLSpanElement | null>;

export function DemoSteps({
  active,
  onSelect,
  progress,
}: {
  active: number;
  onSelect: (index: number) => void;
  progress: StepProgress;
}) {
  return (
    <ol className="space-y-1.5">
      {DEMO_STEPS.map((step, index) => {
        const on = index === active;
        return (
          <li key={step.id}>
            <button
              type="button"
              aria-current={on ? "step" : undefined}
              onClick={() => onSelect(index)}
              className={`relative flex w-full gap-3 rounded-xl border px-3 pt-3 pb-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${
                on
                  ? "border-border bg-muted/50"
                  : "border-transparent hover:bg-muted/40"
              }`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  on
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </span>
              </span>
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-2 h-0.5 overflow-hidden rounded-full bg-foreground/10"
                >
                  <span
                    ref={progress}
                    className="block h-full origin-left bg-foreground"
                    style={{ transform: "scaleX(0)" }}
                  />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * One step's clip. All three stay mounted so the next is already buffered when
 * the current one ends; only the active one is visible, and it starts from the
 * top each time it becomes active. It plays while `run` is true and holds on
 * its current frame otherwise, and its clock drives the step's progress bar.
 */
function DemoClip({
  step,
  active,
  run,
  preload,
  progress,
  onEnded,
}: {
  step: DemoStep;
  active: boolean;
  run: boolean;
  preload: "auto" | "metadata";
  progress: StepProgress;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) video.currentTime = 0;
  }, [active]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && run) {
      // Refused if the browser blocks autoplay; the poster stays up.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, run]);

  // Timeupdate is too coarse for a smooth bar, so read the clock every frame
  // while playing. The bar is written directly rather than through state.
  useEffect(() => {
    const video = ref.current;
    if (!video || !active || !run) return;
    let frame = 0;
    const tick = () => {
      const bar = progress.current;
      if (bar && video.duration)
        bar.style.transform = `scaleX(${video.currentTime / video.duration})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, run, progress]);

  return (
    <video
      ref={ref}
      src={step.video}
      poster={step.poster}
      aria-label={active ? step.alt : undefined}
      aria-hidden={active ? undefined : true}
      muted
      playsInline
      disablePictureInPicture
      preload={preload}
      onEnded={active ? onEnded : undefined}
      className={`absolute inset-0 size-full object-contain ${
        active ? "" : "invisible"
      }`}
    />
  );
}

export function DemoViewer({
  active,
  progress,
  onEnded,
}: {
  active: number;
  progress: StepProgress;
  /** The active clip reached its end. */
  onEnded: () => void;
}) {
  const step = DEMO_STEPS[active] ?? DEMO_STEPS[0];
  // Recordings that run for seconds, and move on by themselves, need a way to
  // stop them; anyone who asked their system for less motion starts stopped.
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  // Off screen, nothing plays, so nothing advances unseen.
  const [inView, setInView] = useState(true);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const next = (active + 1) % DEMO_STEPS.length;
  return (
    <figure className="min-w-0">
      <div
        ref={stage}
        className="relative aspect-video overflow-hidden rounded-xl border bg-[#0c0c0f]"
      >
        {DEMO_STEPS.map((clip, index) => (
          <DemoClip
            key={clip.id}
            step={clip}
            active={index === active}
            run={playing && inView}
            preload={
              playing && (index === active || index === next)
                ? "auto"
                : "metadata"
            }
            progress={progress}
            onEnded={onEnded}
          />
        ))}
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          aria-label={playing ? "Pause the demo" : "Play the demo"}
          className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
        >
          {playing ? (
            <PauseIcon className="size-4" aria-hidden="true" />
          ) : (
            <PlayIcon className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <figcaption className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
        {step.caption}
      </figcaption>
    </figure>
  );
}
