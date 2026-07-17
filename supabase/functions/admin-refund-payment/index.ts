// Supabase Edge Function: admin-refund-payment
//
// Refunds a subscription invoice through Razorpay's real refund API, server-side.
// Follows the same secret/auth pattern as the existing razorpay-* and
// subscription-* functions in textile-spark-net.
//
// Deliberate differences from those functions:
//
//  1. NO DEMO / SIMULATION MODE. The other functions fall back to a simulated
//     flow when RAZORPAY_KEY_SECRET is absent, because publishing an ad without a
//     gateway is harmless. A refund is money. If the keys are missing, or the
//     Razorpay call fails, this returns an error and writes NOTHING — an invoice
//     is never marked refunded without a refund id from Razorpay.
//
//  2. It authorizes the CALLER server-side. verify_jwt=true means the platform has
//     already validated the token signature, so `sub` is trustworthy; we then read
//     that user's profiles row with the service role and require
//     is_admin + admin_role in (super_admin, finance_admin). The admin panel's
//     hidden buttons are irrelevant here — this is the real check for this path,
//     since the service role bypasses RLS by design.
//
//  3. It claims the refund in the DB BEFORE calling the gateway (refund_status
//     null|failed -> 'pending'), mirroring the 'created' -> 'paid' claim used by
//     razorpay-verify-payment. Two admins double-clicking cannot double-refund:
//     the second claim matches zero rows and stops.
//
// Secrets required: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function callerIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

interface InvoiceRow {
  id: string;
  vendor_id: string;
  amount: number;
  gst_amount: number | null;
  currency: string;
  status: string;
  razorpay_payment_id: string | null;
  refund_status: string | null;
  razorpay_refund_id: string | null;
}

const REST = (key: string) => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // ── Authorize the caller (finance_admin / super_admin only) ────────────────
  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  const profResp = await fetch(
    `${url}/rest/v1/profiles?id=eq.${callerId}&select=is_admin,admin_role`,
    { headers: REST(serviceKey) },
  );
  const profRows = profResp.ok ? await profResp.json() : [];
  const caller = Array.isArray(profRows) && profRows.length ? profRows[0] : null;
  if (!caller?.is_admin || !["super_admin", "finance_admin"].includes(caller?.admin_role)) {
    return json({ error: "forbidden", detail: "Refunds require the super_admin or finance_admin role" }, 403);
  }

  // ── Razorpay keys are mandatory. No simulated refunds, ever. ───────────────
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    return json(
      {
        error: "not_configured",
        detail:
          "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set on this project. " +
          "Refunds are not simulated — nothing was changed.",
      },
      503,
    );
  }

  let payload: { invoiceId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const invoiceId = payload.invoiceId;
  if (!invoiceId) return json({ error: "missing_invoice_id" }, 400);

  // ── Load the invoice ──────────────────────────────────────────────────────
  const invResp = await fetch(
    `${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}&select=id,vendor_id,amount,gst_amount,currency,status,razorpay_payment_id,refund_status,razorpay_refund_id`,
    { headers: REST(serviceKey) },
  );
  const invRows = invResp.ok ? await invResp.json() : [];
  const invoice: InvoiceRow | null = Array.isArray(invRows) && invRows.length ? invRows[0] : null;
  if (!invoice) return json({ error: "invoice_not_found" }, 404);

  if (invoice.refund_status === "processed" || invoice.razorpay_refund_id) {
    return json({ error: "already_refunded", refundId: invoice.razorpay_refund_id }, 409);
  }
  if (invoice.status !== "paid") {
    return json({ error: "not_refundable", detail: `Invoice status is '${invoice.status}', expected 'paid'` }, 409);
  }
  if (!invoice.razorpay_payment_id) {
    // Seeded/simulated invoices have no payment id. There is no gateway
    // transaction to reverse, so there is nothing honest to do here.
    return json(
      {
        error: "no_payment_id",
        detail:
          "This invoice has no razorpay_payment_id — it was not paid through the gateway " +
          "(seeded or simulated). There is no real payment to refund.",
      },
      409,
    );
  }

  // The gateway captured (base + GST); the invoice stores them separately, in
  // rupees. Refunding amount alone would silently short the vendor the GST.
  const amountPaise = (invoice.amount + (invoice.gst_amount ?? 0)) * 100;
  if (amountPaise <= 0) return json({ error: "zero_amount" }, 400);

  // ── Claim it, so a double-click can't double-refund ───────────────────────
  const claim = await fetch(
    `${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}&status=eq.paid&or=(refund_status.is.null,refund_status.eq.failed)`,
    {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=representation" },
      body: JSON.stringify({ refund_status: "pending" }),
    },
  );
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) {
    return json({ error: "refund_in_progress", detail: "Another refund attempt is already in flight." }, 409);
  }

  // ── The real Razorpay call ────────────────────────────────────────────────
  let refund: { id?: string; status?: string; amount?: number };
  try {
    const resp = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(invoice.razorpay_payment_id)}/refund`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: amountPaise,
          speed: "normal",
          notes: { invoice_id: invoice.id, vendor_id: invoice.vendor_id, refunded_by: callerId },
        }),
      },
    );

    const bodyText = await resp.text();
    if (!resp.ok) {
      // Release the claim so the refund can be retried once the cause is fixed.
      await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
        method: "PATCH",
        headers: { ...REST(serviceKey), prefer: "return=minimal" },
        body: JSON.stringify({ refund_status: "failed" }),
      });
      return json({ error: "refund_failed", detail: bodyText.slice(0, 400) }, 502);
    }
    refund = JSON.parse(bodyText);
  } catch (e) {
    await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=minimal" },
      body: JSON.stringify({ refund_status: "failed" }),
    });
    return json({ error: "request_failed", detail: String(e) }, 502);
  }

  if (!refund.id) {
    await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=minimal" },
      body: JSON.stringify({ refund_status: "failed" }),
    });
    return json({ error: "refund_failed", detail: "Razorpay returned no refund id" }, 502);
  }

  // ── Record the outcome, exactly as the gateway reported it ────────────────
  // 'processed' -> money is on its way back; the invoice is genuinely refunded.
  // 'pending'   -> Razorpay accepted it but hasn't settled. The invoice stays
  //                'paid' until it does. NOTE: there is no refund webhook in this
  //                project, so a pending refund will not auto-finalise — it must
  //                be reconciled manually (see README).
  const gatewayStatus = refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending";

  const patch: Record<string, unknown> = {
    refund_status: gatewayStatus,
    razorpay_refund_id: refund.id,
    refunded_amount: refund.amount ?? amountPaise,
    refunded_at: new Date().toISOString(),
  };
  if (gatewayStatus === "processed") patch.status = "refunded";

  await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
    method: "PATCH",
    headers: { ...REST(serviceKey), prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });

  return json({
    ok: true,
    refundId: refund.id,
    refundStatus: gatewayStatus,
    amountPaise: refund.amount ?? amountPaise,
    invoiceStatus: gatewayStatus === "processed" ? "refunded" : "paid",
  });
});
