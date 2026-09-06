import { createDevStore, devSeed, minutesAgo } from "./store";

/**
 * C2 - TRANSACTION LEDGER. DEV-SEED ONLY. No unified transactions table exists.
 *
 * WHY THIS IS SEEDED AT ALL, given that money DOES flow through this project:
 * the rows exist, but in two tables with different shapes and different units.
 * `subscription_invoices.amount` is RUPEES ex-GST and `ad_orders.amount` is
 * PAISE, they have different status vocabularies, and neither carries a
 * certificate or a refund of the other kind. Reports.tsx already normalises the
 * two into a revenue figure and is careful about it.
 *
 * A ledger is a different thing: one row per money movement, one status
 * vocabulary, one currency unit, searchable and filterable together. That is a
 * `transactions` table (or a view over the two), and creating it is Phase 2
 * schema work, not a UI change. Deriving it client-side would mean this screen
 * silently disagreeing with Reports the first time either table changed.
 *
 * So: the shape below is the shape Phase 2 should create, and the rows are a
 * fixture. In a production build this list is empty.
 *
 * Phase 2, roughly:
 *   transactions(id, vendor_id, kind, status, amount_paise, gst_paise,
 *                gateway_ref, source_table, source_id, occurred_at)
 * with amount in ONE unit (paise, matching the gateway) so this class of bug
 * cannot come back.
 */

export type TxnKind = "subscription" | "ad_purchase" | "certificate" | "refund";
export type TxnStatus = "paid" | "pending" | "failed" | "refunded";

export const KIND_LABELS: Record<TxnKind, string> = {
  subscription: "Subscription",
  ad_purchase: "Ad purchase",
  certificate: "Certificate",
  refund: "Refund",
};

export interface Transaction {
  id: string;
  /** Human reference, the kind a vendor quotes on a support call. */
  reference: string;
  vendorName: string;
  vendorCity: string;
  kind: TxnKind;
  status: TxnStatus;
  /** PAISE. One unit for every row, unlike the two live tables. */
  amountPaise: number;
  gstPaise: number;
  /** Razorpay payment or refund id, null where the row never reached a gateway. */
  gatewayRef: string | null;
  occurredAt: string;
}

/**
 * Vendor names are invented Indian textile businesses, in the naming style the
 * real vendor base uses (family name plus trade, a mill town). They are
 * fixtures for a development build only, and the screen carrying them says so
 * in a banner above the table.
 */
const SEED: Transaction[] = [
  {
    id: "txn-seed-01",
    reference: "CSR-2609-0148",
    vendorName: "Rathi Textiles",
    vendorCity: "Erode",
    kind: "subscription",
    status: "paid",
    amountPaise: 1_299_00,
    gstPaise: 233_82,
    gatewayRef: "pay_R4mKq21vNbXe9c",
    occurredAt: minutesAgo(4),
  },
  {
    id: "txn-seed-02",
    reference: "CSR-2609-0147",
    vendorName: "Selvam Knit Mills",
    vendorCity: "Tiruppur",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 4_455_00,
    gstPaise: 801_90,
    gatewayRef: "pay_R4mHd88tLpQw2f",
    occurredAt: minutesAgo(19),
  },
  {
    id: "txn-seed-03",
    reference: "CSR-2609-0146",
    vendorName: "Devanshi Fabrics",
    vendorCity: "Surat",
    kind: "certificate",
    status: "pending",
    amountPaise: 199_00,
    gstPaise: 35_82,
    gatewayRef: "pay_R4m9Yz03cVrT7k",
    occurredAt: minutesAgo(41),
  },
  {
    id: "txn-seed-04",
    reference: "CSR-2609-0145",
    vendorName: "Harkirat Hosiery",
    vendorCity: "Ludhiana",
    kind: "subscription",
    status: "failed",
    amountPaise: 2_499_00,
    gstPaise: 449_82,
    gatewayRef: null,
    occurredAt: minutesAgo(63),
  },
  {
    id: "txn-seed-05",
    reference: "CSR-2609-0144",
    vendorName: "Bhilwara Suitings Co",
    vendorCity: "Bhilwara",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 8_910_00,
    gstPaise: 1_603_80,
    gatewayRef: "pay_R4m2Kp77aBnE1s",
    occurredAt: minutesAgo(97),
  },
  {
    id: "txn-seed-06",
    reference: "CSR-2609-0143",
    vendorName: "Meenakshi Handlooms",
    vendorCity: "Kanchipuram",
    kind: "subscription",
    status: "paid",
    amountPaise: 1_299_00,
    gstPaise: 233_82,
    gatewayRef: "pay_R4lwXn45dFgH3m",
    occurredAt: minutesAgo(154),
  },
  {
    id: "txn-seed-07",
    reference: "CSR-2609-0142",
    vendorName: "Nandi Weaves",
    vendorCity: "Ichalkaranji",
    kind: "refund",
    status: "refunded",
    amountPaise: -2_499_00,
    gstPaise: -449_82,
    gatewayRef: "rfnd_R4lpQw12sMkL8j",
    occurredAt: minutesAgo(213),
  },
  {
    id: "txn-seed-08",
    reference: "CSR-2609-0141",
    vendorName: "Panipat Home Textiles",
    vendorCity: "Panipat",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 2_760_00,
    gstPaise: 496_80,
    gatewayRef: "pay_R4lkJd90fRtY4b",
    occurredAt: minutesAgo(288),
  },
  {
    id: "txn-seed-09",
    reference: "CSR-2609-0140",
    vendorName: "Anagha Prints",
    vendorCity: "Bagru",
    kind: "certificate",
    status: "paid",
    amountPaise: 199_00,
    gstPaise: 35_82,
    gatewayRef: "pay_R4lfBc31hSuI6n",
    occurredAt: minutesAgo(376),
  },
  {
    id: "txn-seed-10",
    reference: "CSR-2609-0139",
    vendorName: "Gomti Silk House",
    vendorCity: "Varanasi",
    kind: "subscription",
    status: "paid",
    amountPaise: 2_499_00,
    gstPaise: 449_82,
    gatewayRef: "pay_R4l8Tg64jWvO2p",
    occurredAt: minutesAgo(492),
  },
  {
    id: "txn-seed-11",
    reference: "CSR-2609-0138",
    vendorName: "Bhadohi Carpet Works",
    vendorCity: "Bhadohi",
    kind: "ad_purchase",
    status: "pending",
    amountPaise: 1_380_00,
    gstPaise: 248_40,
    gatewayRef: "pay_R4l3Mn28kXcP9r",
    occurredAt: minutesAgo(631),
  },
  {
    id: "txn-seed-12",
    reference: "CSR-2609-0137",
    vendorName: "Sarvottam Denim",
    vendorCity: "Ahmedabad",
    kind: "subscription",
    status: "paid",
    amountPaise: 4_999_00,
    gstPaise: 899_82,
    gatewayRef: "pay_R4kzFh19mZdQ5t",
    occurredAt: minutesAgo(844),
  },
  {
    id: "txn-seed-13",
    reference: "CSR-2609-0136",
    vendorName: "Kaveri Yarns",
    vendorCity: "Coimbatore",
    kind: "ad_purchase",
    status: "failed",
    amountPaise: 3_540_00,
    gstPaise: 637_20,
    gatewayRef: null,
    occurredAt: minutesAgo(1_102),
  },
  {
    id: "txn-seed-14",
    reference: "CSR-2609-0135",
    vendorName: "Vardhini Exports",
    vendorCity: "Karur",
    kind: "certificate",
    status: "paid",
    amountPaise: 199_00,
    gstPaise: 35_82,
    gatewayRef: "pay_R4ktCv57nAeR3u",
    occurredAt: minutesAgo(1_388),
  },
  {
    id: "txn-seed-15",
    reference: "CSR-2609-0134",
    vendorName: "Selvam Knit Mills",
    vendorCity: "Tiruppur",
    kind: "subscription",
    status: "paid",
    amountPaise: 2_499_00,
    gstPaise: 449_82,
    gatewayRef: "pay_R4knRs83pBfS7v",
    occurredAt: minutesAgo(1_655),
  },
  {
    id: "txn-seed-16",
    reference: "CSR-2609-0133",
    vendorName: "Ishaan Woollens",
    vendorCity: "Amritsar",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 6_105_00,
    gstPaise: 1_098_90,
    gatewayRef: "pay_R4kgWy46qCgT1w",
    occurredAt: minutesAgo(1_991),
  },
  {
    id: "txn-seed-17",
    reference: "CSR-2609-0132",
    vendorName: "Devanshi Fabrics",
    vendorCity: "Surat",
    kind: "refund",
    status: "refunded",
    amountPaise: -1_299_00,
    gstPaise: -233_82,
    gatewayRef: "rfnd_R4kbLp72rDhU4x",
    occurredAt: minutesAgo(2_407),
  },
  {
    id: "txn-seed-18",
    reference: "CSR-2609-0131",
    vendorName: "Trilok Fibres",
    vendorCity: "Bhiwandi",
    kind: "subscription",
    status: "paid",
    amountPaise: 1_299_00,
    gstPaise: 233_82,
    gatewayRef: "pay_R4k5Nq18sEiV6y",
    occurredAt: minutesAgo(2_930),
  },
  {
    id: "txn-seed-19",
    reference: "CSR-2609-0130",
    vendorName: "Chandrika Silks",
    vendorCity: "Mysuru",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 1_770_00,
    gstPaise: 318_60,
    gatewayRef: "pay_R4jyGk35tFjW8z",
    occurredAt: minutesAgo(3_512),
  },
  {
    id: "txn-seed-20",
    reference: "CSR-2609-0129",
    vendorName: "Panipat Home Textiles",
    vendorCity: "Panipat",
    kind: "certificate",
    status: "paid",
    amountPaise: 199_00,
    gstPaise: 35_82,
    gatewayRef: "pay_R4jsDf91uGkX2a",
    occurredAt: minutesAgo(4_198),
  },
  {
    id: "txn-seed-21",
    reference: "CSR-2609-0128",
    vendorName: "Harkirat Hosiery",
    vendorCity: "Ludhiana",
    kind: "subscription",
    status: "paid",
    amountPaise: 2_499_00,
    gstPaise: 449_82,
    gatewayRef: "pay_R4jmZx64vHlY5b",
    occurredAt: minutesAgo(5_030),
  },
  {
    id: "txn-seed-22",
    reference: "CSR-2609-0127",
    vendorName: "Bhilwara Suitings Co",
    vendorCity: "Bhilwara",
    kind: "ad_purchase",
    status: "paid",
    amountPaise: 5_280_00,
    gstPaise: 950_40,
    gatewayRef: "pay_R4jhVc27wImZ9c",
    occurredAt: minutesAgo(6_144),
  },
];

export const transactionStore = createDevStore<Transaction>(devSeed(SEED));

/** Rupees from paise, formatted the way every money figure in this app is. */
export function inrFromPaise(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "-" : "";
  return `${sign}₹${Math.abs(rupees).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
