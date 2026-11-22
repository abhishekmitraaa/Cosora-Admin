import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * "Back" on a detail page (review AR-M05, 2026-11-22). Opened from inside Cosora-Admin it
 * returns to the page the admin came from, with its tab and filters (they live in the
 * address); opened from a link or a new tab, where there is no in-app history, it goes to
 * `fallback`. Decided by React Router's history index, never `window.history.length`, which
 * counts other sites' entries.
 */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const navigate = useNavigate();
  const inApp = typeof window !== "undefined" && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!inApp || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(-1);
  }

  return (
    <Link
      to={fallback}
      onClick={onClick}
      // A full 44 px row on a phone, padded rather than enlarged on a computer (AR-L46).
      className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:min-h-9"
    >
      <ArrowLeft size={14} /> {inApp ? "Back" : label}
    </Link>
  );
}
