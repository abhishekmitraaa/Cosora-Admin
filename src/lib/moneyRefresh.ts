import type { QueryClient } from "@tanstack/react-query";

/**
 * Everything that shows money or a plan's state, refreshed together after any money action (review AR-M35,
 * 2026-11-22): a closed 7-day guarantee still offered Cancel, and a refund left the ledger and the KPIs as they were.
 * A new list of money or plan state adds its key here.
 */
const MONEY_KEYS = [
  "invoices",
  "credit-notes",
  "refund-guarantee-requests",
  "subscriptions",
  "subscription-worklist",
  "subscription-kpis",
  "payments-ledger",
  "payments-summary",
  "payments-latest",
  "billing-incidents",
  "reports",
];

export function refreshMoney(qc: QueryClient) {
  for (const key of MONEY_KEYS) void qc.invalidateQueries({ queryKey: [key] });
}
