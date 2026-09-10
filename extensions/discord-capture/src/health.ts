/**
 * Is capture still working?
 *
 * The extension reads Discord's rendered markup, and Discord rewrites its
 * markup whenever it likes. When that happens nothing throws: the selectors
 * simply stop matching, every row reads as unreadable, and capture quietly
 * collects nothing. The only symptom is a badge that never moves again — which
 * looks exactly like a quiet channel.
 *
 * So the shape of the failure is worth watching for directly: messages are on
 * screen, capture is on for this channel, and none of them can be read. The
 * rule lives here, away from the DOM, because "how many samples before we call
 * it" is a judgement worth being able to test.
 */

export interface HealthSample {
  /** Message elements found on screen. */
  elements: number;
  /** Of those, how many the parser could read. */
  readable: number;
  /** Whether capture is on for what is being shown. */
  capturing: boolean;
}

export type Health =
  | { state: "ok" }
  | { state: "idle" }
  | { state: "broken"; elements: number };

/**
 * How many messages have to be on screen before "none of them parse" means
 * anything.
 *
 * One unreadable row is an attachment-only post. A screenful of them is a
 * parser that has stopped understanding the page.
 */
export const ENOUGH = 6;

/**
 * Consecutive bad samples before saying so.
 *
 * A single sample can catch the page mid-render, with rows present and their
 * contents not yet filled in. Two in a row, taken a while apart, cannot.
 */
export const STRIKES = 2;

/**
 * Whether a sample looks like a parser that has stopped working.
 *
 * "Capturing" matters: a paused channel legitimately reads nothing, and
 * reporting that as breakage would cry wolf on the most common state there is.
 */
export function judge(sample: HealthSample): Health {
  if (!sample.capturing || sample.elements < ENOUGH) return { state: "idle" };
  return sample.readable > 0
    ? { state: "ok" }
    : { state: "broken", elements: sample.elements };
}

/** Runs of bad samples, so one unlucky frame cannot raise the alarm. */
export class HealthWatch {
  private strikes = 0;

  /**
   * Take a sample. Returns the state to report, or null when nothing has
   * changed enough to be worth reporting.
   */
  add(sample: HealthSample): Health | null {
    const verdict = judge(sample);
    if (verdict.state !== "broken") {
      // Anything that reads clears the count, including a paused channel: the
      // evidence for breakage has to be current, not accumulated over an
      // afternoon.
      const wasBroken = this.strikes >= STRIKES;
      this.strikes = 0;
      return wasBroken ? { state: "ok" } : null;
    }
    this.strikes++;
    return this.strikes === STRIKES ? verdict : null;
  }
}
