import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import type { AdminRole } from "@/lib/roles";

/**
 * Product moderation: remove and flag a listing with a reason from managed templates
 * (textile-spark-net migration 20261007160000_product_moderation, design
 * documentation/product-moderation-design-2026-10-07.md).
 *
 * Every write is a SECURITY DEFINER RPC that checks the caller's role, records the reason
 * for the Admin Log, writes the moderation ledger and notifies the vendor, in one
 * transaction. The page never writes the removal or flag columns itself: the products
 * guard trigger refuses that for every browser client.
 */

export type ReasonUse = "remove" | "flag";

export interface ProductReason {
  id: string;
  label: string;
  vendor_message: string;
  applies_to: ReasonUse[];
  active: boolean;
  sort: number;
}

export interface ModerationEvent {
  id: string;
  action: "remove" | "flag" | "reinstate";
  reason_label: string | null;
  message: string | null;
  note: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
}

/** Mirrors admin.product_moderation_can_act(): approve, reject, flag, remove. */
export const PRODUCT_MODERATORS: AdminRole[] = ["super_admin", "product_moderator", "manager"];
/** Mirrors admin.product_reasons_can_edit(): the templates, and reinstating a removal. */
export const REASON_EDITORS: AdminRole[] = ["super_admin", "manager"];

export const canModerateProducts = (role: AdminRole | null) => role !== null && PRODUCT_MODERATORS.includes(role);
export const canEditReasons = (role: AdminRole | null) => role !== null && REASON_EDITORS.includes(role);

/** What the vendor will read: the template's message, then the note as "Details". */
export function vendorMessage(reason: Pick<ProductReason, "vendor_message"> | undefined, note: string): string {
  if (!reason) return "";
  const n = note.trim();
  return reason.vendor_message.trim() + (n ? `\nDetails: ${n}` : "");
}

const REASONS_KEY = ["product-moderation-reasons"];

/** Active reasons for the pickers, or every reason for the templates page (super admin, manager). */
export function useProductReasons(includeInactive = false) {
  return useQuery({
    queryKey: [...REASONS_KEY, includeInactive ? "all" : "active"],
    queryFn: async (): Promise<ProductReason[]> => {
      const { data, error } = await supabase.rpc("admin_product_reasons", {
        p_include_inactive: includeInactive,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductReason[];
    },
  });
}

export function useModerationHistory(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["product-moderation-history", productId],
    enabled,
    queryFn: async (): Promise<ModerationEvent[]> => {
      const { data, error } = await supabase.rpc("admin_product_moderation_history", {
        p_product_id: productId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ModerationEvent[];
    },
  });
}

function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["product-moderation-history"] });
    void qc.invalidateQueries({ queryKey: ["flags", "product"] });
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };
}

export interface ActionInput {
  productId: string;
  reasonId: string;
  note: string;
}

export function useRemoveProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async ({ productId, reasonId, note }: ActionInput) =>
      assertWrote(
        await supabase.rpc("admin_product_remove", {
          p_product_id: productId,
          p_reason_id: reasonId,
          p_note: note.trim() || undefined,
        }),
        "remove listing",
      ),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useFlagProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async ({ productId, reasonId, note }: ActionInput) =>
      assertWrote(
        await supabase.rpc("admin_product_flag", {
          p_product_id: productId,
          p_reason_id: reasonId,
          p_note: note.trim() || undefined,
        }),
        "flag listing",
      ),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReinstateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async ({ productId, note }: { productId: string; note: string }) =>
      assertWrote(
        await supabase.rpc("admin_product_reinstate", { p_product_id: productId, p_note: note.trim() }),
        "reinstate listing",
      ),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface ReasonDraft {
  id: string | null;
  label: string;
  vendor_message: string;
  applies_to: ReasonUse[];
  active: boolean;
  sort?: number;
}

export function useSaveReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: ReasonDraft) => {
      // Returns the row's id; an error (role, validation, duplicate name) raises.
      const { data, error } = await supabase.rpc("admin_product_reason_save", {
        // The RPC reads a null id as "add".
        p_id: r.id as string,
        p_label: r.label.trim(),
        p_vendor_message: r.vendor_message.trim(),
        p_applies_to: r.applies_to,
        p_active: r.active,
        p_sort: r.sort,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("The reason was not saved. Nothing was changed.");
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: REASONS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Swap two reasons' places in one change (AR-L05: two saves could leave both on one position). */
export function useSwapReasons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: string; b: string }) => {
      const { error } = await supabase.rpc("admin_product_reasons_swap" as never, { p_a: a, p_b: b } as never);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: REASONS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}
