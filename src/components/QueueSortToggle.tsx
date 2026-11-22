import type { QueueSort } from "@/lib/queuePaging";

/** Oldest first / Newest first for a moderation queue (AR-M13). Its choice lives in the address. */
export function QueueSortToggle({ value, onChange }: { value: QueueSort; onChange: (next: QueueSort) => void }) {
  const options: { id: QueueSort; label: string }[] = [
    { id: "oldest", label: "Oldest first" },
    { id: "newest", label: "Newest first" },
  ];
  return (
    <div role="radiogroup" aria-label="Order" className="mb-3 inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={
            "min-h-[32px] rounded-md px-3 font-medium transition-colors " +
            (value === o.id ? "bg-surface-2 text-ink shadow-sm" : "text-ink-muted hover:text-ink")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
