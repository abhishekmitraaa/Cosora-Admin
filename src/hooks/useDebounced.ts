import { useEffect, useState } from "react";

/**
 * `value`, once it has stopped changing for `ms`. A search box feeds its query from this, so typing doesn't start a
 * request per keystroke (Cosora-Admin review 2026-11-22, AR-H17).
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
