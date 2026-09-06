import { useSyncExternalStore } from "react";

/**
 * Theme preference: light, dark, or follow the operating system.
 *
 * Three states, not two. "System" is the default and is a real, distinct value:
 * an admin who has never touched the control follows their OS, and an admin who
 * explicitly picks Light keeps Light on a machine set to dark at 18:00. Storing
 * only a boolean would collapse those two into one and silently flip the app
 * under someone who had chosen otherwise.
 *
 * Applied by stamping `data-theme` on <html>, which src/index.css reads. In
 * "system" mode the attribute is REMOVED rather than set, so the
 * `prefers-color-scheme` media block in that file is what decides - no
 * JavaScript listener needed for the OS flipping mid-session.
 */
export type ThemeChoice = "light" | "dark" | "system";

const KEY = "cosora-admin-theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private mode / storage disabled. Fall through to the default.
  }
  return "system";
}

let current: ThemeChoice = read();

/** Stamp (or clear) the attribute src/index.css keys off. */
function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/**
 * Call once at boot, before React renders, so the first paint is already in the
 * right mode. Without this the app flashes light for a frame on a dark machine.
 */
export function initTheme() {
  apply(current);
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  apply(choice);
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Preference is not persisted; the session still honours it.
  }
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => "system" as ThemeChoice,
  );
}

/**
 * What is actually on screen right now, with "system" resolved. Components that
 * merely style themselves should use tokens and never need this; it exists for
 * the two places that hand a colour to a non-CSS consumer - Recharts, which
 * takes string props, and MapLibre, which needs a whole style URL.
 */
export function useResolvedTheme(): "light" | "dark" {
  const choice = useTheme();
  const systemDark = useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/**
 * Read a design token as a concrete `rgb(...)` string.
 *
 * Recharts and MapLibre take colours as strings, not classes, so they cannot
 * consume `text-ink-muted`. Rather than hardcoding a second palette for charts
 * (which is exactly how the light and dark modes drift apart), they read the
 * live value of the same variable the rest of the app uses.
 */
export function tokenColor(name: string, alpha = 1): string {
  if (typeof window === "undefined") return "rgb(0 0 0)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!raw) return "rgb(0 0 0)";
  return alpha === 1 ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`;
}
