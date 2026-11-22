import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A page's tab, filter or search kept in the address (review AR-M04, 2026-11-22), so a
 * reload, Back to the page and a shared link all bring it back. Writes REPLACE the
 * current entry: changing a filter never adds a Back step, and Back still leaves the page.
 *
 * A value equal to its default is left out of the address, so a plain link stays plain.
 * `allowed` refuses values the page doesn't know (an old or hand-typed link).
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = (raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? raw : fallback) as T;

  const set = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback || next === "") p.delete(key);
          else p.set(key, next);
          return p;
        },
        { replace: true, state: window.history.state?.usr },
      );
    },
    [key, fallback, setParams],
  );

  return [value, set];
}

type FilterValue = string | number | boolean | null;

/**
 * A filter object kept in the address, one parameter per field (`prefix` + field name).
 * Each field is read back as its default's type: text, a number (a null default means
 * "a number or nothing") or a boolean ("1" / "0"). Defaults are left out of the address.
 */
export function useUrlFilters<F extends { [K in keyof F]: FilterValue | undefined }>(
  defaults: F,
  prefix = "",
): [F, (next: F | ((prev: F) => F)) => void] {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(defaults) as (keyof F & string)[];
  const signature = keys.map((k) => `${k}=${params.get(prefix + k) ?? ""}`).join("&");

  const value = useMemo(() => {
    const out = { ...defaults };
    for (const k of keys) {
      const raw = params.get(prefix + k);
      if (raw === null) continue;
      const d = defaults[k];
      if (typeof d === "boolean") (out as Record<string, FilterValue | undefined>)[k] = raw === "1";
      else if (typeof d === "number" || d === null) {
        const n = Number(raw);
        if (raw !== "" && Number.isFinite(n)) (out as Record<string, FilterValue | undefined>)[k] = n;
      } else (out as Record<string, FilterValue | undefined>)[k] = raw;
    }
    return out;
    // `signature` is what the address says for these keys; defaults are constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, prefix]);

  const set = useCallback(
    (next: F | ((prev: F) => F)) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const resolved = typeof next === "function" ? (next as (prev: F) => F)(value) : next;
          for (const k of keys) {
            const v = resolved[k];
            const d = defaults[k];
            if (v === undefined || v === null || v === d || v === "") p.delete(prefix + k);
            else p.set(prefix + k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
          }
          return p;
        },
        { replace: true, state: window.history.state?.usr },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, prefix, setParams],
  );

  return [value, set];
}
