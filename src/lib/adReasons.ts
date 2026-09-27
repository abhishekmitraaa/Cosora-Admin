import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdReasonCode {
  code: string;
  label: string;
}

/**
 * The ad-moderation reason vocabulary, read from admin_ad_reason_codes() (admin
 * completion, Phase 3a). One list, kept in the database, for the review queue's
 * Reject / Request changes / Suspend and for Pause and Reject on the campaign
 * tabs. The rejection-reason breakdown counts these codes, so two spellings of one
 * reason would split it in two. The note carries the detail the vendor reads.
 */
export function useAdReasonCodes() {
  return useQuery({
    queryKey: ["ad-reason-codes"],
    queryFn: async (): Promise<AdReasonCode[]> => {
      const { data, error } = await supabase.rpc("admin_ad_reason_codes");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    // The list changes by migration only.
    staleTime: 60 * 60_000,
  });
}

/** The label for a stored code, or the code itself if it isn't on the list. */
export function reasonLabel(codes: AdReasonCode[] | undefined, code: string | null): string | null {
  if (!code) return null;
  return codes?.find((c) => c.code === code)?.label ?? code;
}
