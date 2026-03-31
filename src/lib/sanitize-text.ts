/**
 * Sanitize user-supplied free-text (trade notes / descriptions).
 *
 * Rules (applied in order):
 *  1. Strip URLs — any token that looks like a hyperlink (http/https/ftp,
 *     bare www., or a domain-like string with a path) is removed.
 *  2. Strip SQL injection patterns — keywords and sequences commonly used
 *     in injection attacks.
 *  3. Collapse extra whitespace left by the stripping passes.
 */

// Matches http(s)/ftp URLs, bare www. URLs, and domain-like strings (e.g. foo.com/path)
const URL_RE =
  /(?:https?:\/\/|ftp:\/\/|www\.)\S+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/\S*)?/gi;

// Common SQL injection keywords and operator sequences.
// Uses word boundaries where possible so "season" isn't caught, etc.
const SQL_PATTERNS = [
  /\b(select|insert|update|delete|drop|truncate|alter|create|replace|exec|execute|union|declare|cast|convert|xp_|sp_)\b/gi,
  /(-{2}|\/\*|\*\/|;|\bOR\b|\bAND\b)\s*(?:\d+\s*=\s*\d+|'[^']*'\s*=\s*'[^']*')/gi,
  /'[^']*'\s*(=|<|>|!=|<>|like)\s*'[^']*'/gi, // 'a'='a' style
  /\b(waitfor\s+delay|benchmark\s*\(|sleep\s*\(|pg_sleep\s*\()/gi,
  /0x[0-9a-fA-F]+/g, // hex literals
];

export function sanitizeNoteText(input: string): string {
  let s = input;

  // 1. Remove URLs
  s = s.replace(URL_RE, "");

  // 2. Remove SQL injection patterns
  for (const re of SQL_PATTERNS) {
    s = s.replace(re, "");
  }

  // 3. Tidy up whitespace
  s = s
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .join("\n")
    .trim();

  return s;
}
