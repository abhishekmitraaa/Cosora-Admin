import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cn(...parts: unknown[]) {
  return twMerge(clsx(parts));
}

type Variant = "primary" | "danger" | "ghost" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
  ghost: "text-slate-700 hover:bg-slate-100",
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
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm",
        "outline-none focus:border-slate-500 disabled:bg-slate-100",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm",
        "outline-none focus:border-slate-500 disabled:bg-slate-100",
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={cn(
        "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none",
        "focus:border-slate-500 disabled:bg-slate-100",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white p-4", className)}>{children}</div>;
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

/**
 * Shown when the signed-in role may view a section but not act in it. The copy
 * deliberately says the DATABASE rejects the write — hiding the buttons is only
 * a convenience, not the control.
 */
export function ReadOnlyBanner({ reason }: { reason: string }) {
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {reason}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="p-6 text-sm text-slate-500">{label}</div>;
}

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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

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
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
            active === t.id
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
