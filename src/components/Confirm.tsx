import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@/components/ui";

/**
 * One confirmation for Cosora-Admin (review AR-L51, 2026-11-23). Every "are you sure?" used the browser's confirm(),
 * which can't say which button is the destructive one, looks different in every browser and can be silenced for the
 * tab. `useConfirm()` returns `ask({ title, message, confirmLabel, danger })`, a promise of true (confirmed) or false
 * (Cancel, Esc, the backdrop or Back). The dialog is the panel's own Modal, so Back and Esc behave as everywhere else.
 */
export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    // A second question while one is open answers the first "no".
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpen(o);
    });
  }, []);

  const finish = (ok: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(ok);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal open={open !== null} title={open?.title ?? ""} onClose={() => finish(false)}>
        {open?.message && <div className="text-sm leading-relaxed text-ink-muted">{open.message}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {/* Focus starts on the safe choice when the action is destructive. */}
          <Button variant="outline" onClick={() => finish(false)} data-autofocus={open?.danger ? "" : undefined}>
            {open?.cancelLabel ?? "Cancel"}
          </Button>
          <Button variant={open?.danger ? "danger" : "primary"} onClick={() => finish(true)} data-autofocus={open?.danger ? undefined : ""}>
            {open?.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm() needs <ConfirmProvider> above it");
  return ask;
}
