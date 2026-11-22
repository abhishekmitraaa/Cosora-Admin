/**
 * Times in India time whatever the admin's browser says (review AR-L09, 2026-11-22): staff travel, and a reply time
 * or a blog's publish time read in another zone was wrong by hours. Cosora's rule: every time shows in IST.
 */
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts });
const DATE_TIME = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const DATE = fmt({ day: "numeric", month: "short", year: "numeric" });
const TIME = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });

/** "22 Nov, 18:05" in IST. */
export const istDateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : "");
/** "22 Nov 2026" in IST. */
export const istDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : "");
/** "18:05" in IST. */
export const istClock = (iso: string | null | undefined) => (iso ? TIME.format(new Date(iso)) : "");
