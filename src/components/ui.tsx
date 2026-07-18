import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect } from "react";
import { Inbox, Loader2, X } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export function cn(...parts: unknown[]) {
  return twMerge(clsx(parts));
}

/* ------------------------------------------------------------------ *
 * Brand mark — one monogram tile + wordmark, shared by the rail and
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
  const tile = size === "sm" ? "h-8 w-8 text-[15px]" : "h-9 w-9 text-lg";
  return (
    <div className="flex items-center gap-2.5">
      {/* Woven monogram: denim-indigo tile with a marigold selvedge thread. */}
      <div
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-display font-bold leading-none text-white shadow-sm",
          "bg-gradient-to-br from-brand to-brand-800",
          tile,
        )}
        aria-hidden
      >
        C
        <span className="pointer-events-none absolute inset-x-1.5 bottom-[5px] h-[2px] rounded-full bg-marigold" />
      </div>
      {wordmark && (
        <div className="leading-tight">
          <div
            className={cn(
              "font-display text-[15px] font-bold tracking-tight",
              onDark ? "text-white" : "text-ink",
            )}
          >
            Cosora
          </div>
          <div className={cn("text-[11px] font-medium", onDark ? "text-rail-muted" : "text-ink-faint")}>
            Admin console
          </div>
        </div>
      )}
    </div>
  );
}

/** The signature selvedge stripe — indigo body, marigold ID thread. */
export function Selvedge({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("selvedge-tick inline-block w-[3px] shrink-0 rounded-full", className)} />
  );
}

/** Centered, branded frame for the sign-in / set-password screens. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[420px] w-[min(760px,120vw)] -translate-x-1/2 rounded-full bg-brand/10 blur-[120px]" />
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
 * Button
 * ------------------------------------------------------------------ */
type Variant = "primary" | "danger" | "ghost" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-xs hover:bg-brand-700 focus-visible:ring-brand/35 active:translate-y-px",
  danger:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 focus-visible:ring-red-500/35 active:translate-y-px",
  outline:
    "border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-canvas focus-visible:ring-brand/25",
  ghost: "text-ink-muted hover:bg-black/[0.05] hover:text-ink focus-visible:ring-brand/25",
};

export function Button({
  variant = "outline",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
        "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Form fields
 * ------------------------------------------------------------------ */
const FIELD =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs " +
  "placeholder:text-ink-faint transition-colors outline-none " +
  "focus:border-brand focus:ring-4 focus:ring-brand/15 " +
  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(FIELD, "resize-y leading-relaxed", className)} />;
}

// Native chevron is hidden; we draw our own so the control matches the inputs.
const CHEVRON: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b6472' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
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
      className={cn(FIELD, "cursor-pointer appearance-none py-1.5 pr-9", className)}
    >
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5 shadow-card", className)}>
      {children}
    </div>
  );
}

/** Small caps section label used inside cards. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-sm font-semibold text-ink", className)}>{children}</h2>;
}

/* ------------------------------------------------------------------ *
 * Badge — status is encoded in tint + a leading dot, not colour alone.
 * ------------------------------------------------------------------ */
type Tone = "slate" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200/70",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
};

const DOT: Record<Tone, string> = {
  slate: "bg-slate-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
};

export function Badge({
  children,
  tone = "slate",
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
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Selvedge className="mt-1 h-8" />
        <div>
          <h1 className="font-display text-[1.55rem] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notices
 * ------------------------------------------------------------------ */
export function ReadOnlyBanner({ reason }: { reason: string }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <span>{reason}</span>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/** Neutral explanatory note — the "here's how this works" boxes above tables. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-canvas px-3.5 py-3 text-xs leading-relaxed text-ink-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-faint ring-1 ring-inset ring-line">
        <Inbox size={20} />
      </div>
      <p className="max-w-sm text-sm text-ink-muted">{children}</p>
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

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-pop animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md p-1 text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
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
        <thead className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h || i} className="px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "border-brand text-ink"
              : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
