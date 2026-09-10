/**
 * Waiting, in a tab whose timers may not be honoured.
 *
 * Chrome throttles `setTimeout` in a hidden tab: to a second after ten seconds
 * of hiding, and to once a minute once it decides the page is idle. A search
 * run paces itself on 150ms polls, so in a background tab it does not run
 * slowly so much as stop — and a background tab is exactly where a run spends
 * its life, because the whole point of the panel is that you can go and do
 * something else.
 *
 * The extension's worker is not a tab and is not throttled, so it can keep the
 * time instead. This module is the rule for when to ask it, split out because
 * the racing is the part that would hang a run if it were wrong, and that is
 * worth testing without a browser.
 */

export interface WaitParts {
  /** Whether the page is currently hidden, and so subject to throttling. */
  hidden: () => boolean;
  /** This page's own timer. Throttled when hidden, but always eventually fires. */
  local: (ms: number) => Promise<void>;
  /** The worker's timer. Accurate, but the worker can be torn down. */
  remote: (ms: number) => Promise<void>;
}

/**
 * Wait at least `ms`.
 *
 * While visible, the page's own timer is accurate and there is nothing to gain
 * from a message round trip. While hidden, both timers run and the first to
 * finish wins: the worker normally, the throttled local timer if the worker has
 * been torn down or is slow to answer. Because both resolve only after `ms` has
 * passed, racing them can never cut a wait short — and because the local timer
 * always eventually fires, a worker that never answers costs latency rather
 * than a stalled run.
 */
export function waitFor(ms: number, parts: WaitParts): Promise<void> {
  if (!(ms > 0)) return Promise.resolve();
  if (!parts.hidden()) return parts.local(ms);
  const local = parts.local(ms);
  return Promise.race([
    local,
    // A rejection here means the worker is unreachable, which is not a reason
    // to reject the wait — the local timer is still running and still correct.
    parts.remote(ms).catch(() => local),
  ]);
}
