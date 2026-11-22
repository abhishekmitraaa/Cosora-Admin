import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui";

interface CreditNoteRow {
  id: string;
  credit_note_number: string;
  total_paise: number;
  created_at: string;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Open a credit note's PDF: invoice-render draws it once, the admin's own session signs it for 5 minutes. */
async function openCreditNotePdf(creditNoteId: string): Promise<void> {
  // Opened in the click, so a popup blocker allows it; pointed at the PDF once signed.
  const win = window.open("about:blank", "_blank");
  try {
    const { data, error } = await supabase.functions.invoke("invoice-render", { body: { creditNoteId } });
    const path = (data as { path?: string } | null)?.path;
    if (error || !path) throw new Error("The credit note couldn't be prepared.");
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error("The credit note couldn't be signed.");
    if (win) win.location.href = signed.data.signedUrl;
    else window.location.assign(signed.data.signedUrl);
  } catch (e) {
    win?.close();
    toast.error((e as Error).message);
  }
}

/**
 * The credit notes a refunded invoice issued (Cosora-Admin review 2026-11-22, AR-H14). They were issued by the
 * database on every processed refund and shown nowhere. Read through subscription_credit_notes' own policy (super
 * admins, finance and support).
 */
export function CreditNotes({ invoiceId }: { invoiceId: string }) {
  const notes = useQuery({
    queryKey: ["credit-notes", invoiceId],
    queryFn: async (): Promise<CreditNoteRow[]> => {
      const { data, error } = await supabase
        .from("subscription_credit_notes" as never)
        .select("id, credit_note_number, total_paise, created_at")
        .eq("invoice_id", invoiceId)
        .order("created_at");
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as unknown as CreditNoteRow[];
    },
  });
  if (notes.error) return <span className="mt-1 block text-2xs text-critical-fg">Credit notes couldn't be read.</span>;
  if (!notes.data?.length) return null;
  return (
    <span className="mt-1 block space-y-1">
      {notes.data.map((n) => (
        <span key={n.id} className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span className="font-mono">{n.credit_note_number}</span>
          <span className="tabular-nums">{inr(n.total_paise)}</span>
          <Button size="sm" onClick={() => void openCreditNotePdf(n.id)} aria-label={`Credit note ${n.credit_note_number} PDF`}>
            PDF
          </Button>
        </span>
      ))}
    </span>
  );
}
