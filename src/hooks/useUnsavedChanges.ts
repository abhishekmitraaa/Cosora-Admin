import { useEffect, useRef } from "react";

const MESSAGE = "You have unsaved changes on this page. Leave without saving?";

/**
 * Asks before a page with unsaved edits is left (review AR-M24, 2026-11-22): Theme, the New Arrivals carousel and
 * Billing details lost a whole edit to one stray click. Covers the three ways out:
 *   - closing or reloading the tab (`beforeunload`, the browser's own prompt);
 *   - a link inside Cosora-Admin (the sidebar, a breadcrumb): caught before React Router sees the click;
 *   - Back and Forward: a guard history entry sits on top while there are edits, and Back onto it asks.
 * Dialogs have their own guard (`Modal` in components/ui.tsx). The app uses BrowserRouter, so React Router's
 * blocker isn't available; this is the same idea by hand.
 */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Back: an extra entry for this same address. Leaving it by Back asks; staying re-adds it.
    const marker = `unsaved-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ...window.history.state, cosoraUnsaved: marker }, "");
    const onPop = () => {
      if (window.history.state?.cosoraUnsaved === marker) return;
      if (!dirtyRef.current) return;
      if (window.confirm(MESSAGE)) {
        // Let the Back through: one more step past the page's own entry.
        dirtyRef.current = false;
        window.history.back();
      } else {
        window.history.pushState({ ...window.history.state, cosoraUnsaved: marker }, "");
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      // Saved or reset: take the guard entry back off, so Back leaves in one step again. Deferred, as in Modal,
      // so StrictMode's mount-unmount-mount doesn't pop the page's own entry.
      setTimeout(() => {
        if (window.history.state?.cosoraUnsaved === marker) window.history.back();
      }, 0);
    };
  }, [dirty]);
}
