import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect } from "react";
import { Inbox, Loader2, Monitor, Moon, Sun, X } from "lucide-react";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/* ═══════════════════════════════════════════════════════════════════════════
 * THE COMPONENT KIT
 *
 * One definition per surface, reused by every page. Anything a page renders
 * more than once - a card, a table row, a badge, a stat tile, a definition
 * list, a status banner - lives here, not inlined per screen. That was the
 * single biggest source of visual drift before this pass: Products, Ads and
 * Videos each shipped their own private `<Attr>`, and the three had already
 * diverged.
 *
 * Colours come only from the token set in src/index.css. There is not one
 * `slate-*` or `dark:` in this file, and there should not be one in a page
 * either - if a page needs a colour the tokens do not cover, the token set is
 * what is missing.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function cn(...parts: unknown[]) {
  return twMerge(clsx(parts));
}

/* ------------------------------------------------------------------ *
 * Brand mark - one monogram tile + wordmark, shared by the rail and
 * the auth screens so the identity reads the same everywhere.
 * ------------------------------------------------------------------ */
export function Logo({
  wordmark = true,
  onDark = false,
  size = "md",
}: {
  wordmark?: boolean;
  onDark?: boolean;
  size?: "sm" | "md";
}) {
  const tile = size === "sm" ? "h-8 w-8 text-section" : "h-9 w-9 text-lg";
  return (
    <div className="flex items-center gap-2.5">
      {/* Woven monogram: the tile is always dark with a white selvedge thread,
          in both themes - it is a mark, not a surface, and a mark that inverts
          stops being recognisable. */}
      <div
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-rail font-display font-bold leading-none text-rail-fg shadow-sm ring-1 ring-white/10",
          tile,
        )}
        aria-hidden
      >
        C
        <span className="pointer-events-none absolute inset-x-1.5 bottom-[5px] h-[2px] rounded-sm bg-white/85" />
      </div>
      {wordmark && (
        <div className="leading-tight">
          <div
            className={cn(
              "font-display text-section font-bold tracking-tight",
              onDark ? "text-rail-fg" : "text-ink",
            )}
          >
            Cosora
          </div>
          <div className={cn("text-2xs font-medium", onDark ? "text-rail-muted" : "text-ink-faint")}>
            Admin console
          </div>
        </div>
      )}
    </div>
  );
}

/** The signature selvedge stripe, marking a page title or an active nav seam. */
export function Selvedge({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("selvedge-tick inline-block w-[3px] shrink-0 rounded-sm", className)} />
  );
}

/** Centered, branded frame for the sign-in / set-password screens. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-canvas p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[420px] w-[min(760px,120vw)] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-[120px]" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
        {footer && <p className="mt-4 text-center text-xs text-ink-faint">{footer}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page frame - owns max width and vertical rhythm so pages stop each
 * picking their own max-w-4xl / 5xl / 6xl.
 * ------------------------------------------------------------------ */
const WIDTHS = {
  narrow: "max-w-3xl", // single-column forms and short lists
  default: "max-w-5xl", // card queues, the common case
  wide: "max-w-7xl", // wide tables and the map
} as const;

export function Page({
  width = "default",
  children,
}: {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return <div className={cn("w-full", WIDTHS[width])}>{children}</div>;
}

/** Standard gap between the stacked blocks of a page. */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */
type Variant = "primary" | "danger" | "ghost" | "outline";

const VARIANTS: Record<Variant, string> = {
  // The accent inverts between modes, so `text-brand-fg` (not a literal white)
  // is what keeps the label readable in both. This is the button-contrast rule.
  primary: "bg-brand text-brand-fg shadow-xs hover:bg-brand-hover active:translate-y-px",
  // `danger-solid` is its own token pair, not the `critical` status tint: a
  // filled button needs a red dark enough to carry white text at 4.5:1, and the
  // red that reads correctly as a badge dot does not (it measures ~3:1).
  danger:
    "bg-danger text-danger-fg shadow-xs hover:bg-danger-hover active:translate-y-px",
  outline:
    "border border-line-control bg-surface text-ink shadow-xs hover:bg-surface-2",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
};

const SIZES = {
  sm: "px-2.5 py-1 text-xs gap-1",
  md: "px-3 py-1.5 text-sm gap-1.5",
} as const;

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return (
    <button
      {...props}
      className={cn(
        // whitespace-nowrap: a control label must never wrap to two lines.
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium",
        "transition-[background-color,border-color,color,transform] duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Form fields. Label ABOVE the input, never a placeholder standing in
 * for one - the placeholder is an example, the label is the name.
 * ------------------------------------------------------------------ */
const FIELD =
  "w-full rounded-lg border border-line-control bg-surface px-3 py-2 text-sm text-ink shadow-xs " +
  "placeholder:text-ink-faint transition-colors outline-none " +
  "focus:border-brand focus:ring-4 focus:ring-brand/15 " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-faint";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(FIELD, "resize-y leading-relaxed", className)} />;
}

/**
 * Labelled field wrapper. `label` is required on purpose: there is no code path
 * in this kit that produces an input whose only description is its placeholder.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-critical-fg">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

// Native chevron is hidden; we draw our own so the control matches the inputs.
// currentColor rather than a baked hex, so it follows the theme.
const CHEVRON: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.55rem center",
};

export function Select({
  className,
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      style={CHEVRON}
      className={cn(FIELD, "cursor-pointer appearance-none py-1.5 pr-9 text-ink-muted", className)}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5",
        className,
      )}
    >
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--brand))]"
      />
      <span className="text-xs leading-relaxed">
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-ink-faint">{hint}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */
export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-card",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A card with a heading and optional explanation, which is what nearly every
 * block on every page actually is. Pages used to hand-roll
 * `<Card><h2 className="mb-3 text-sm font-semibold …">` twenty times over.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-section font-bold text-ink">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Small caps section label used inside cards. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("font-display text-section font-bold text-ink", className)}>{children}</h2>;
}

/** The one sub-heading treatment inside a panel. */
export function SubHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-2xs font-semibold uppercase tracking-wider text-ink-faint", className)}>
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ *
 * Badge - status is encoded in tint + a leading dot, never colour alone.
 * ------------------------------------------------------------------ */
export type Tone = "neutral" | "positive" | "caution" | "critical" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral-fg ring-neutral-line",
  positive: "bg-positive-bg text-positive-fg ring-positive-line",
  caution: "bg-caution-bg text-caution-fg ring-caution-line",
  critical: "bg-critical-bg text-critical-fg ring-critical-line",
  info: "bg-info-bg text-info-fg ring-info-line",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-neutral-dot",
  positive: "bg-positive-dot",
  caution: "bg-caution-dot",
  critical: "bg-critical-dot",
  info: "bg-info-dot",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * One status word to one tone, for every status string this app renders.
 *
 * Subscriptions had its own private copy of this mapping and Ads/Products each
 * had an inline chain of ternaries. Same vocabulary, one table, so "paid" is
 * the same green on the invoice table and the payments ledger.
 */
const STATUS_TONE: Record<string, Tone> = {
  // moderation
  live: "positive",
  active: "positive",
  approved: "positive",
  under_review: "caution",
  pending: "caution",
  paused: "caution",
  draft: "neutral",
  inactive: "neutral",
  rejected: "critical",
  suspended: "critical",
  // ad campaign states (20260912120000). Without these every new status fell
  // through to "neutral", so "pending_review" and "expired" rendered grey and
  // identical — the queue's most important distinction, invisible.
  pending_review: "caution",
  changes_requested: "caution",
  scheduled: "info",
  paused_by_vendor: "caution",
  paused_by_admin: "critical",
  expired: "neutral",
  archived: "neutral",
  budget_exhausted: "neutral",
  ended: "neutral",
  promoted: "positive",
  resumed: "positive",
  resubmitted: "caution",
  submitted: "caution",
  // money
  paid: "positive",
  processed: "positive",
  succeeded: "positive",
  refunded: "info",
  failed: "critical",
  canceled: "critical",
  cancelled: "critical",
  // fulfilment
  processing: "caution",
  printed: "info",
  dispatched: "info",
  delivered: "positive",
  returned: "critical",
};

export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot={dot}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}

/* ------------------------------------------------------------------ *
 * Page header
 * ------------------------------------------------------------------ */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Selvedge className="mt-1 h-8" />
        <div>
          <h1 className="font-display text-title font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notices - one component, five tones, instead of a hand-built
 * `rounded-md border border-amber-200 bg-amber-50 …` div per site.
 * ------------------------------------------------------------------ */
export function Notice({
  tone = "neutral",
  title,
  icon,
  children,
  className,
  marker,
}: {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stable `data-marker` hook for the browser smoke script. See ReadOnlyBanner. */
  marker?: string;
}) {
  return (
    <div
      data-marker={marker}
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon ?? <span className={cn("mt-1.5 block h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      </span>
      <div className="min-w-0 leading-relaxed">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/**
 * `data-marker="readonly-banner"` is a stable hook for scripts/smoke.mjs, which
 * used to select this by its `.bg-amber-50` utility class. Selecting a banner by
 * the colour it happens to be is exactly what breaks on a redesign, so the
 * script now targets the attribute and the colour is free to be a token.
 */
export function ReadOnlyBanner({ reason }: { reason: string }) {
  return (
    <Notice tone="caution" className="mb-4" marker="readonly-banner">
      {reason}
    </Notice>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Notice tone="critical">{message}</Notice>;
}

/** Neutral explanatory note - the "here is how this works" boxes above tables. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-ink-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Marks a screen whose numbers are a local development fixture.
 *
 * Rendered only where `devOnly*()` supplied the rows, and worded so it cannot
 * be mistaken for a styling flourish. In a production build these pages render
 * their empty state instead and this banner never mounts.
 */
export function DevSeedBanner({ what }: { what: string }) {
  return (
    <Notice tone="info" title="Development sample data" className="mb-4">
      {what} is not wired to a database table yet. Everything below comes from a local seed array
      that ships only in a development build, so nothing here is a real Cosora figure. A production
      build renders this screen empty until Phase 2 creates the table.
    </Notice>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-faint ring-1 ring-inset ring-line">
        <Inbox size={20} />
      </div>
      <p className="max-w-sm text-sm text-ink-muted">{children}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-6 text-sm text-ink-muted">
      <Loader2 size={16} className="animate-spin text-brand" />
      {label}
    </div>
  );
}

/**
 * Loading placeholder shaped like the thing that is coming, rather than a
 * spinner in the middle of an empty page. `rows` matches the card list that
 * will replace it, so the layout does not jump when the data lands.
 */
export function SkeletonList({ rows = 3, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("skeleton rounded-xl", height)} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */
export function Modal({
  open,
  title,
  onClose,
  children,
  width = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-pop animate-scale-in",
          width === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line bg-surface-2 text-left text-2xs uppercase tracking-wider text-ink-faint">
          <tr>
            {head.map((h, i) => (
              <th key={h || i} className="px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** The one table-row hover treatment, so clickable rows look alike everywhere. */
export const ROW_HOVER = "transition-colors hover:bg-surface-2";

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "border-brand text-ink"
              : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {t.label}
          {t.count != null && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-2xs tabular-nums",
                active === t.id ? "bg-brand-tint text-ink" : "bg-surface-2 text-ink-faint",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Data primitives
 * ------------------------------------------------------------------ */

/**
 * One inline "Label: value" pair. Products, Ads and Videos each shipped their
 * own copy of this before the redesign, and they had drifted - two used
 * `text-slate-400` for the term, one used `text-ink-faint`, and one rendered a
 * different fallback glyph. One definition, one fallback.
 */
export function Attr({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <dt className="inline text-ink-faint">{label}: </dt>
      <dd className={cn("inline text-ink-muted", mono && "font-mono text-2xs")}>
        {empty ? <span className="text-ink-ghost">not set</span> : value}
      </dd>
    </div>
  );
}

/** Stacked label-over-value, for detail panes rather than dense card meta. */
export function DataField({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={cn("text-sm text-ink", mono && "font-mono text-xs")}>
        {empty ? <span className="font-sans text-sm text-ink-ghost">not set</span> : value}
      </dd>
    </div>
  );
}

/** The grid these two sit in, so column counts are consistent per density. */
export function AttrGrid({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs",
        cols === 3 && "sm:grid-cols-3",
        cols === 4 && "sm:grid-cols-4",
      )}
    >
      {children}
    </dl>
  );
}

/**
 * Stat tile. The figure carries the display face and tabular numerals; the
 * label is above it, not below, so a column of tiles scans as one list.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="flex items-center gap-3.5">
      {icon && (
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
            tone ? TONES[tone] : "bg-brand-tint text-ink ring-line",
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div className="mt-0.5 truncate font-display text-metric font-bold tabular-nums text-ink">
          {value}
        </div>
        {sub && <div className="mt-0.5 truncate text-2xs text-ink-faint">{sub}</div>}
      </div>
    </Card>
  );
}

/**
 * A proportion bar.
 *
 * Deliberately a thin rule on a hairline track, not the chunky filled-track
 * widget: it sits inside dense table rows and cards, where a heavy bar reads
 * as decoration. `caption` is required because a bar with no number is a
 * shape, not a measurement.
 */
export function Meter({
  value,
  max,
  caption,
  tone = "neutral",
  title,
}: {
  value: number;
  max: number;
  caption: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="min-w-0" title={title}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-sm bg-line"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
      >
        <div
          className={cn("h-full rounded-sm transition-[width] duration-300", DOTS[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-2xs tabular-nums text-ink-faint">{caption}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Theme control
 * ------------------------------------------------------------------ */
const THEME_OPTIONS: { id: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

/**
 * Three-state segmented control, sitting in the rail footer. "System" is a real
 * option rather than an implied default, so an admin can go back to following
 * their machine after trying a fixed mode.
 */
export function ThemeToggle({ onRail = false }: { onRail?: boolean }) {
  const choice = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "flex gap-0.5 rounded-lg p-0.5",
        onRail ? "bg-white/[0.06]" : "border border-line bg-surface-2",
      )}
    >
      {THEME_OPTIONS.map(({ id, label, Icon }) => {
        const on = choice === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            title={label}
            onClick={() => setTheme(id)}
            className={cn(
              "grid h-7 flex-1 place-items-center rounded-md transition-colors",
              onRail
                ? on
                  ? "bg-white/[0.14] text-rail-fg"
                  : "text-rail-muted hover:text-rail-fg"
                : on
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-faint hover:text-ink",
            )}
          >
            <Icon size={14} />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
