import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { istDateTime } from "@/lib/ist";
import { Badge, Empty, ErrorNote, Panel, SkeletonList, Table } from "@/components/ui";

/**
 * Two records the database kept that staff couldn't see (review AR-L41, 2026-11-23): a seller's bulk imports
 * (`product_import_batches`) and the contact reveals around the account (`admin.vendor_contact_reveals`,
 * `admin.buyer_contact_reveals`). Read through `admin_vendor_import_batches()` and `admin_contact_reveals()`; a role
 * the database refuses (42501) sees neither panel.
 */
type ImportBatch = {
  id: string;
  file_name: string | null;
  as_draft: boolean;
  total: number;
  created: number;
  failed: number;
  errors: unknown;
  created_at: string;
};

type Reveal = {
  direction: "theirs_by" | "by_them";
  other_id: string;
  other_name: string;
  number_of: "seller" | "buyer";
  revealed_at: string;
};

const refused = (e: { code?: string } | null) => e?.code === "42501";

function rowErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => {
    if (e && typeof e === "object") {
      const o = e as { row?: number; error?: string; message?: string };
      const text = o.error ?? o.message ?? JSON.stringify(e);
      return o.row != null ? `Row ${o.row}: ${text}` : text;
    }
    return String(e);
  });
}

export function VendorActivityPanels({ vendorId }: { vendorId: string }) {
  const imports = useQuery({
    queryKey: ["vendor-import-batches", vendorId],
    queryFn: async (): Promise<ImportBatch[] | null> => {
      const { data, error } = await supabase.rpc("admin_vendor_import_batches" as never, { p_vendor: vendorId, p_limit: 20 } as never);
      if (refused(error)) return null;
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as ImportBatch[];
    },
  });
  const reveals = useQuery({
    queryKey: ["contact-reveals", vendorId],
    queryFn: async (): Promise<Reveal[] | null> => {
      const { data, error } = await supabase.rpc("admin_contact_reveals" as never, { p_profile: vendorId, p_limit: 50 } as never);
      if (refused(error)) return null;
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as Reveal[];
    },
  });

  return (
    <>
      {imports.data !== null && (
        <Panel title="Bulk imports" description="Spreadsheets this seller uploaded through bulk import, newest first (the last 20).">
          {imports.isPending ? (
            <SkeletonList rows={1} height="h-10" />
          ) : imports.error ? (
            <ErrorNote message={`Bulk imports couldn't load: ${(imports.error as Error).message}`} />
          ) : (imports.data ?? []).length === 0 ? (
            <Empty>No bulk imports.</Empty>
          ) : (
            <Table head={["When", "File", "Listed as", "Rows", "Added", "Failed"]}>
              {(imports.data ?? []).map((b) => {
                const errs = rowErrors(b.errors);
                return (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{istDateTime(b.created_at)}</td>
                    <td className="max-w-[14rem] break-all px-3 py-2">{b.file_name ?? "—"}</td>
                    <td className="px-3 py-2">{b.as_draft ? "Drafts" : "For review"}</td>
                    <td className="px-3 py-2 tabular-nums">{b.total}</td>
                    <td className="px-3 py-2 tabular-nums">{b.created}</td>
                    <td className="px-3 py-2">
                      {b.failed > 0 ? (
                        <details>
                          <summary className="cursor-pointer">
                            <Badge tone="caution">{b.failed}</Badge>
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-2xs text-ink-muted">
                            {errs.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                            {b.failed > errs.length && <li>…and {b.failed - errs.length} more</li>}
                          </ul>
                        </details>
                      ) : (
                        <span className="tabular-nums">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      )}

      {reveals.data !== null && (
        <Panel
          title="Contact reveals"
          description="Who asked to see this account's phone number, and whose numbers it asked to see; newest first (the last 50). A buyer revealing a seller's number is kept once per pair, at the latest time."
        >
          {reveals.isPending ? (
            <SkeletonList rows={1} height="h-10" />
          ) : reveals.error ? (
            <ErrorNote message={`Contact reveals couldn't load: ${(reveals.error as Error).message}`} />
          ) : (reveals.data ?? []).length === 0 ? (
            <Empty>No contact reveals.</Empty>
          ) : (
            <Table head={["When", "What", "Account"]}>
              {(reveals.data ?? []).map((r, i) => (
                <tr key={`${r.direction}-${r.other_id}-${r.revealed_at}-${i}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{istDateTime(r.revealed_at)}</td>
                  <td className="px-3 py-2">
                    {r.direction === "theirs_by" ? (
                      <Badge tone="info">revealed this account's number</Badge>
                    ) : (
                      <Badge>{r.number_of === "seller" ? "this account revealed a seller's number" : "this account revealed a buyer's number"}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.direction === "by_them" && r.number_of === "seller" ? (
                      <Link className="text-brand hover:underline" to={`/vendors/${r.other_id}`}>
                        {r.other_name}
                      </Link>
                    ) : (
                      r.other_name
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
