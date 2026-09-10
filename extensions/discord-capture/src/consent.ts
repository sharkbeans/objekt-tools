/**
 * What the user has agreed to, and when.
 *
 * Both stores require the same thing before an extension reads anything a
 * person wrote: the disclosure has to be in the extension's own UI, not only in
 * the store listing, and the user has to take a deliberate action agreeing to
 * it. So this is a gate, not a preference — nothing reads a message body until
 * `capture` is recorded here, and nothing types into Discord until `automation`
 * is.
 *
 * They are separate because they carry different risk. Reading posts already on
 * screen stays inside the browser; driving Discord's search box is automation of
 * someone's own account, which Discord's terms do not allow, so agreeing to the
 * first must never be read as agreeing to the second.
 */

/**
 * Bumped when the disclosure changes materially, which re-asks everyone.
 *
 * Consent to an older description of what the extension does is not consent to
 * a newer one.
 */
export const CONSENT_VERSION = 1;

export interface Consent {
  version: number;
  /** When capture was agreed to. */
  acceptedAt: string;
  /** When search automation was agreed to, or null while it has not been. */
  automationAt: string | null;
}

function isIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * The stored record, or null when there is none this build can rely on.
 *
 * A record from a future version is also rejected: it was written by a build
 * that disclosed something this one does not know about.
 */
export function readConsent(value: unknown): Consent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== CONSENT_VERSION) return null;
  if (!isIso(record.acceptedAt)) return null;
  return {
    version: CONSENT_VERSION,
    acceptedAt: record.acceptedAt,
    automationAt: isIso(record.automationAt) ? record.automationAt : null,
  };
}

/** Whether message bodies may be read at all. */
export function captureAllowed(value: unknown): boolean {
  return readConsent(value) !== null;
}

/** Whether the extension may type into Discord's search box. */
export function automationAllowed(value: unknown): boolean {
  return readConsent(value)?.automationAt !== null && captureAllowed(value);
}

/** Record capture consent, keeping any automation consent already given. */
export function acceptCapture(existing: unknown, now = new Date()): Consent {
  const previous = readConsent(existing);
  return {
    version: CONSENT_VERSION,
    acceptedAt: previous?.acceptedAt ?? now.toISOString(),
    automationAt: previous?.automationAt ?? null,
  };
}

/**
 * Record automation consent.
 *
 * Implies capture consent: agreeing to a search that collects posts is
 * agreeing to collecting them. The reverse is deliberately not true.
 */
export function acceptAutomation(existing: unknown, now = new Date()): Consent {
  const base = acceptCapture(existing, now);
  return { ...base, automationAt: base.automationAt ?? now.toISOString() };
}

/** Forget both, which is what the UI's withdraw button writes. */
export function withdrawConsent(): null {
  return null;
}
