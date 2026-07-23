// Minimal log line formatter — a trimmed port of app/ui/js/logfmt.js. Escapes
// HTML, linkifies URLs, and detects a severity level for colouring. Enough for
// the App Center live log viewer; can be expanded later.

import { escapeHtml } from "@/lib/helpers";

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

export type LogLevel = "error" | "warn" | "info" | "sys" | "out";

export function detectLevel(line: string): LogLevel | null {
  const l = line.toLowerCase();
  if (/\b(error|err|fatal|panic|exception|failed)\b/.test(l)) return "error";
  if (/\b(warn|warning|deprecated)\b/.test(l)) return "warn";
  if (/\b(info|listening|started|ready|compiled)\b/.test(l)) return "info";
  return null;
}

/** Escape a log line and turn URLs into clickable links (data-url handled by the viewer). */
export function format(line: string): string {
  const esc = escapeHtml(line);
  return esc.replace(URL_RE, (m) => `<a class="lg-link" href="#" data-url="${m}">${m}</a>`);
}
