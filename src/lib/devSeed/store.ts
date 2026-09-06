import { useSyncExternalStore } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEV-SEED STORES - THE CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Five sections in this pass (Site content, Payments, Certificates, Discounts,
 * Customers) have a finished UI and no table behind them. Phase 2 creates the
 * tables. Until then each one reads from a local seed array through a store
 * built here.
 *
 * THE RULE, straight from textile-spark-net's notificationsStore.ts and the
 * project's "no mock data in production" line: the seed exists in a DEVELOPMENT
 * build and is `[]` in a production build.
 *
 *   - `import.meta.env.DEV` is statically replaced by Vite, so `if (DEV)` here
 *     is a compile-time constant and every seed array is tree-shaken out of the
 *     production bundle entirely. It is not shipped and then hidden.
 *   - In production these screens render their empty state, which is the
 *     correct and honest thing for a feature whose table does not exist.
 *   - In development every screen carrying seeded rows also renders a
 *     <DevSeedBanner>, so nobody mistakes a fixture for a real Cosora figure.
 *
 * WHY A MUTABLE STORE RATHER THAN A CONSTANT. The point of these screens is to
 * exercise the interactions - add a banner, advance a certificate, deactivate a
 * discount - so the UI can be reviewed and, in Phase 2, wired up without being
 * rebuilt. So the store holds state and notifies subscribers, exactly like the
 * `*Store.ts` files in textile-spark-net.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: persist. There is no localStorage here. A
 * reload resets to the seed, which keeps it obvious that nothing is being
 * saved anywhere, and means a fixture can never outlive the session that made
 * it and be mistaken later for a record.
 *
 * PHASE 2 SWAPS ONE THING. Replace `useDevSeed(store)` with a React Query
 * `useQuery`, and the mutators with mutations. The components, their props and
 * their layout do not change.
 */

export const SEED_ACTIVE = import.meta.env.DEV;

/**
 * Wrap every seed array in this AT ITS DECLARATION SITE, not inside the store.
 *
 * `import.meta.env.DEV` is replaced with the literal `false` at build time, so
 * `devSeed(SEED)` folds to `[]` and the array beside it becomes unreachable and
 * is dropped. Doing the check inside `createDevStore` instead is not enough and
 * this was verified, not assumed: with the gate only inside the shared
 * constructor, Rollup inlined three of the five call sites and kept the other
 * two, and the banner and discount fixtures shipped in the production bundle.
 * Grep a real seed string out of `dist/assets/*.js` after any change here.
 */
export function devSeed<T>(seed: T[]): T[] {
  return import.meta.env.DEV ? seed : [];
}

export interface DevStore<T> {
  get(): T[];
  set(next: T[]): void;
  update(fn: (rows: T[]) => T[]): void;
  subscribe(listener: () => void): () => void;
}

export function createDevStore<T>(seed: T[]): DevStore<T> {
  // The one line that keeps a fixture out of production. `SEED_ACTIVE` is a
  // build-time constant, so the seed array is dead code in a production build.
  let rows: T[] = SEED_ACTIVE ? seed : [];
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const l of listeners) l();
  };

  return {
    get: () => rows,
    set(next) {
      rows = next;
      emit();
    },
    update(fn) {
      rows = fn(rows);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useDevSeed<T>(store: DevStore<T>): T[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Ids for rows created during a dev session. Prefixed so a fixture id can never
 * be confused with a database uuid in a log or a screenshot.
 */
let counter = 0;
export function devId(prefix: string): string {
  counter += 1;
  return `${prefix}-dev-${counter.toString().padStart(3, "0")}`;
}

/** Relative timestamps, evaluated at module load so the seed reads as recent. */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
export const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
