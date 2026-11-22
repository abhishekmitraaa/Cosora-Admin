// Supabase Edge Function: admin-refund-payment
//
// Refunds a subscription invoice, or a paid ad order (AR-H15, 2026-11-22), through Razorpay's real refund API,
// server-side. Follows the same secret/auth pattern as the existing razorpay-* and subscription-* functions in
// textile-spark-net. POST { invoiceId } or { adOrderId, amountPaise?, note? }.
//
// Deliberate differences from those functions:
//
//  1. NO DEMO / SIMULATION MODE. The other functions fall back to a simulated
//     flow when RAZORPAY_KEY_SECRET is absent, because publishing an ad without a
//     gateway is harmless. A refund is money. If the keys are missing, or the
//     Razorpay call fails, this returns an error and writes NOTHING — an invoice
//     is never marked refunded without a refund id from Razorpay.
//
//  2. It authorizes the CALLER server-side. Supabase Auth confirms the token (the user behind it, not just a
//     decodable `sub`: AR-L11, 2026-11-22), an account still on a temporary password is refused (AR-H06), and
//     admin_status_of() (service role, reads admin.admin_users) must say super_admin or finance_admin. The admin
//     panel's hidden buttons are irrelevant here — this is the real check for this path, since the service role
//     bypasses RLS by design.
//
//  3. It claims the refund in the DB BEFORE calling the gateway (refund_status
//     null|failed -> 'pending'), mirroring the 'created' -> 'paid' claim used by
//     razorpay-verify-payment. Two admins double-clicking cannot double-refund:
//     the second claim matches zero rows and stops.
//
//  4. An invoice whose value was credited into a later plan (superseded_at: the upgrade charged only the
//     difference) is not refunded on its own (AR-H07, Mitra 2026-11-22): the money lives in the later plan's
//     invoice, and refunding both would pay the credit back twice.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller as Supabase Auth confirms it, and whether it is still on a temporary password. */
async function verifiedCaller(req: Request, url: string, apikey: string): Promise<{ id: string; mustChangePassword: boolean } | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization.trim())) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey, authorization } });
    if (!r.ok) return null;
    const user = await r.json();
    if (typeof user?.id !== "string" || !user.id) return null;
    return { id: user.id, mustChangePassword: user?.app_metadata?.must_change_password === true };
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
  superseded_at: string | null;
  /** Subscriptions P1 (2026-10-08). */
  total_paise?: number | null;
}

const REST = (key: string) => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
});

const RAZORPAY = () => Deno.env.get("RAZORPAY_API_URL") || "https://api.razorpay.com";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // ── Authorize the caller (finance_admin / super_admin only) ────────────────
  const verified = await verifiedCaller(req, url, serviceKey);
  if (!verified) return json({ error: "unauthenticated" }, 401);
  if (verified.mustChangePassword) {
    return json({ error: "forbidden", detail: "Choose your own password before refunding anything." }, 403);
  }
  const callerId = verified.id;

  // admin_status_of() reads admin.admin_users, the source of truth since
  // admin-schema separation Phase 5 (service_role only). Any failure leaves
  // caller null, which is a 403: this fails closed.
  const statusResp = await fetch(`${url}/rest/v1/rpc/admin_status_of`, {
    method: "POST",
    headers: REST(serviceKey),
    body: JSON.stringify({ p_user_id: callerId }),
  });
  const statusRows = statusResp.ok ? await statusResp.json() : [];
  const caller = Array.isArray(statusRows) && statusRows.length ? statusRows[0] : null;
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
  const gatewayAuth = `Basic ${btoa(`${keyId}:${keySecret}`)}`;

  let payload: { invoiceId?: string; adOrderId?: string; amountPaise?: number; note?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // Admin Log (MPF-26). Rows are written with the service-role key, so the audit trigger can't tell who asked;
  // record each attempt from here on, success or failure, for the admin whose token was checked above. Best effort:
  // a failed record is logged, and never changes the refund's outcome.
  const recordRefund = async (table: string, id: string, changes: Record<string, unknown>): Promise<void> => {
    try {
      const r = await fetch(`${url}/rest/v1/rpc/admin_audit_record`, {
        method: "POST",
        headers: REST(serviceKey),
        body: JSON.stringify({
          p_actor: callerId, p_action: "refund", p_target_table: table, p_target_id: id,
          p_changes: changes, p_source: "edge:admin-refund-payment",
        }),
      });
      if (!r.ok) console.error("admin-refund-payment: Admin Log record failed", r.status, (await r.text()).slice(0, 200));
    } catch (e) {
      console.error("admin-refund-payment: Admin Log record failed", String(e));
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // An ad order (AR-H15)
  // ════════════════════════════════════════════════════════════════════════════
  if (payload.adOrderId !== undefined) {
    const orderId = typeof payload.adOrderId === "string" && /^order_[A-Za-z0-9]{6,40}$/.test(payload.adOrderId)
      ? payload.adOrderId : null;
    if (!orderId) {
      return json({ error: "no_payment_id", detail: "Only an order paid through Razorpay can be refunded here." }, 400);
    }
    const rpc = (fn: string, args: Record<string, unknown>) =>
      fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: REST(serviceKey), body: JSON.stringify(args) });

    // What the order charged, to cap the refund: read before the claim, which checks it again under a lock.
    const orderResp = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&select=amount,vendor_id`, { headers: REST(serviceKey) });
    const orderRows = orderResp.ok ? await orderResp.json() : [];
    const order = Array.isArray(orderRows) && orderRows.length ? orderRows[0] as { amount: number; vendor_id: string } : null;
    if (!order) return json({ error: "order_not_found" }, 404);
    const amountPaise = Number.isInteger(payload.amountPaise) ? payload.amountPaise as number : order.amount;

    const claimResp = await rpc("ad_order_refund_claim", { p_order_id: orderId, p_amount_paise: amountPaise, p_note: payload.note ?? null });
    const claim = claimResp.ok ? await claimResp.json() : null;
    if (!claim?.ok) {
      const reason = claim?.reason ?? "claim_failed";
      const detail = reason === "already" ? "This order has a refund already, or one is with Razorpay."
        : reason === "not_paid" ? "Only a paid order can be refunded."
        : reason === "bad_amount" ? "The refund must be more than ₹0 and no more than the order charged."
        : "The order couldn't be claimed for a refund.";
      return json({ error: reason, detail }, 409);
    }
    const fail = async (detail: string, status: number) => {
      await rpc("ad_order_refund_record", { p_order_id: orderId, p_payment_ref: null, p_refund_ref: null, p_status: "failed", p_amount_paise: null });
      await recordRefund("public.ad_orders", orderId, { vendor_id: order.vendor_id, amount_paise: amountPaise, refund_status: "failed", error: detail.slice(0, 200) });
      return json({ error: "refund_failed", detail }, status);
    };

    // The captured payment behind the order. Ad orders didn't store it, so Razorpay is asked.
    let paymentId: string | null = claim.razorpay_payment_id ?? null;
    if (!paymentId) {
      try {
        const pr = await fetch(`${RAZORPAY()}/v1/orders/${encodeURIComponent(orderId)}/payments`, { headers: { authorization: gatewayAuth } });
        if (!pr.ok) return await fail(`Razorpay didn't list the order's payments: ${(await pr.text()).slice(0, 200)}`, 502);
        const list = await pr.json() as { items?: { id: string; status: string }[] };
        paymentId = list.items?.find((p) => p.status === "captured")?.id ?? null;
      } catch (e) {
        return await fail(String(e), 502);
      }
      if (!paymentId) return await fail("Razorpay has no captured payment for this order.", 409);
    }

    let refund: { id?: string; status?: string; amount?: number };
    try {
      const resp = await fetch(`${RAZORPAY()}/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: "POST",
        headers: { authorization: gatewayAuth, "content-type": "application/json" },
        body: JSON.stringify({ amount: amountPaise, speed: "normal", notes: { ad_order_id: orderId, refunded_by: callerId } }),
      });
      const text = await resp.text();
      if (!resp.ok) return await fail(text.slice(0, 400), 502);
      refund = JSON.parse(text);
    } catch (e) {
      return await fail(String(e), 502);
    }
    if (!refund.id) return await fail("Razorpay returned no refund id", 502);

    const status = refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending";
    const saved = await rpc("ad_order_refund_record", {
      p_order_id: orderId, p_payment_ref: paymentId, p_refund_ref: refund.id, p_status: status, p_amount_paise: refund.amount ?? amountPaise,
    });
    await recordRefund("public.ad_orders", orderId, {
      vendor_id: order.vendor_id, amount_paise: refund.amount ?? amountPaise, refund_status: status, razorpay_refund_id: refund.id,
      ...(saved.ok ? {} : { order_not_updated: saved.status }),
    });
    return json({ ok: true, recorded: saved.ok, refundId: refund.id, refundStatus: status, amountPaise: refund.amount ?? amountPaise });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // A plan invoice
  // ════════════════════════════════════════════════════════════════════════════
  const invoiceId = payload.invoiceId;
  if (!invoiceId) return json({ error: "missing_invoice_id" }, 400);
  // It goes into a query string below.
  if (!UUID.test(invoiceId)) return json({ error: "invoice_not_found" }, 404);

  const invResp = await fetch(
    `${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}&select=id,vendor_id,amount,gst_amount,currency,status,razorpay_payment_id,refund_status,razorpay_refund_id,superseded_at,total_paise`,
    { headers: REST(serviceKey) },
  );
  const invRows = invResp.ok ? await invResp.json() : [];
  const invoice: InvoiceRow | null = Array.isArray(invRows) && invRows.length ? invRows[0] : null;
  if (!invoice) return json({ error: "invoice_not_found" }, 404);

  // From refund_status, not razorpay_refund_id: a refund Razorpay marked failed keeps its id (here and in
  // subscription_refund_event), and checking the id refused every retry of a failed refund (2026-10-20 audit).
  if (invoice.refund_status === "processed") {
    return json({ error: "already_refunded", refundId: invoice.razorpay_refund_id }, 409);
  }
  if (invoice.refund_status === "pending") {
    return json({ error: "refund_in_progress", detail: "A refund for this invoice is already with Razorpay." }, 409);
  }
  if (invoice.status !== "paid") {
    return json({ error: "not_refundable", detail: `Invoice status is '${invoice.status}', expected 'paid'` }, 409);
  }
  if (invoice.superseded_at) {
    return json({
      error: "credited_into_later_plan",
      detail: "This invoice's value was taken off a later plan as credit, so it isn't refunded on its own. Refund the newest invoice instead.",
    }, 409);
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

  // The gateway captured (base + GST). Invoices since 2026-10-08 store that total in
  // paise; older ones store base and GST separately, in rupees. Refunding amount alone
  // would silently short the vendor the GST.
  // Rounded: rupees with paise (999 + 179.82) times 100 is 117881.99999999999 in floating point, and
  // Razorpay refuses an amount that isn't a whole number of paise.
  const amountPaise = invoice.total_paise ?? Math.round((invoice.amount + (invoice.gst_amount ?? 0)) * 100);
  if (amountPaise <= 0) return json({ error: "zero_amount" }, 400);

  // ── Claim it, so a double-click can't double-refund ───────────────────────
  // superseded_at=is.null: an upgrade that credits this invoice between the read above and here wins.
  const claim = await fetch(
    `${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}&status=eq.paid&superseded_at=is.null&or=(refund_status.is.null,refund_status.eq.failed)`,
    {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=representation" },
      // A retry after a failed refund drops the failed refund's id (the Admin Log has it), so Razorpay's event
      // for the new refund can still complete the invoice if the write below doesn't.
      body: JSON.stringify({ refund_status: "pending", razorpay_refund_id: null }),
    },
  );
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) {
    return json({ error: "refund_in_progress", detail: "Another refund attempt is already in flight." }, 409);
  }

  const record = (outcome: Record<string, unknown>) =>
    recordRefund("public.subscription_invoices", invoice.id, { vendor_id: invoice.vendor_id, amount_paise: amountPaise, ...outcome });
  const releaseAsFailed = () =>
    fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=minimal" },
      body: JSON.stringify({ refund_status: "failed" }),
    });

  // ── The real Razorpay call ────────────────────────────────────────────────
  let refund: { id?: string; status?: string; amount?: number };
  try {
    const resp = await fetch(
      // RAZORPAY_API_URL names a local or staging mock; unset (production), it is Razorpay itself.
      `${RAZORPAY()}/v1/payments/${encodeURIComponent(invoice.razorpay_payment_id)}/refund`,
      {
        method: "POST",
        headers: { authorization: gatewayAuth, "content-type": "application/json" },
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
      await releaseAsFailed();
      await record({ refund_status: "failed", error: bodyText.slice(0, 200) });
      return json({ error: "refund_failed", detail: bodyText.slice(0, 400) }, 502);
    }
    refund = JSON.parse(bodyText);
  } catch (e) {
    await releaseAsFailed();
    await record({ refund_status: "failed", error: String(e).slice(0, 200) });
    return json({ error: "request_failed", detail: String(e) }, 502);
  }

  if (!refund.id) {
    await releaseAsFailed();
    await record({ refund_status: "failed", error: "Razorpay returned no refund id" });
    return json({ error: "refund_failed", detail: "Razorpay returned no refund id" }, 502);
  }

  // ── Record the outcome, exactly as the gateway reported it ────────────────
  // 'processed' -> money is on its way back; the invoice is genuinely refunded.
  // 'pending'   -> Razorpay accepted it but hasn't settled. The invoice stays
  //                'paid' until it does: Razorpay's refund.processed / refund.failed
  //                event reaches subscription-webhook, which finishes it
  //                (public.subscription_refund_event, subscriptions P1, 2026-10-08).
  // A processed refund issues a credit note (trg_subscription_invoices_credit_note).
  // This function writes with the service role, which the invoice-immutability
  // trigger allows; a browser can't.
  const gatewayStatus = refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending";

  const patch: Record<string, unknown> = {
    refund_status: gatewayStatus,
    razorpay_refund_id: refund.id,
    refunded_amount: refund.amount ?? amountPaise,
    refunded_at: new Date().toISOString(),
  };
  if (gatewayStatus === "processed") patch.status = "refunded";

  // The money has moved whatever happens here, so a failed write still answers ok, but says so. The claim
  // left the invoice 'pending' with no refund id, which Razorpay's refund.processed event (subscription_refund_event
  // matches on the payment id when no refund id is stored) completes later; the Admin Log keeps the refund id.
  let recorded = false;
  let recordError: string | null = null;
  try {
    const saved = await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    recorded = saved.ok;
    if (!saved.ok) recordError = `${saved.status} ${(await saved.text()).slice(0, 200)}`;
  } catch (e) {
    recordError = String(e).slice(0, 200);
  }
  if (!recorded) console.error("admin-refund-payment: refund issued but not recorded on the invoice", invoiceId, refund.id, recordError);
  await record({
    refund_status: gatewayStatus, razorpay_refund_id: refund.id, refunded_amount: patch.refunded_amount,
    ...(recorded ? {} : { invoice_not_updated: recordError ?? "unknown" }),
  });

  return json({
    ok: true,
    recorded,
    refundId: refund.id,
    refundStatus: gatewayStatus,
    amountPaise: refund.amount ?? amountPaise,
    invoiceStatus: gatewayStatus === "processed" ? "refunded" : "paid",
  });
});
