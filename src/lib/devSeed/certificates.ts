import { createDevStore, daysAgo, devSeed } from "./store";

/**
 * C3 - PHYSICAL CERTIFICATE FULFILMENT. DEV-SEED ONLY.
 *
 * ⚠ BUILT PENDING ANDY'S CONFIRMATION that certificates are a physical,
 * printed-and-couriered product rather than a purely digital badge. Everything
 * below assumes physical: a print step, a courier, a tracking number and a
 * delivery address. If that decision goes the other way, the tab set collapses
 * to issued/revoked and the address and courier fields come out.
 *
 * WHAT EXISTS TODAY. `verifiedCertificate` is a real ad placement (₹199 in
 * `razorpay-create-order`'s AD_PRICE table) and buying it grants a time-bound
 * trust seal through `ad_verified_until`. So the PURCHASE is real; the
 * fulfilment is not modelled anywhere. There is no certificate row, no status,
 * no address snapshot and no tracking number in the schema.
 *
 * Phase 2, roughly:
 *   certificate_orders(id, vendor_id, ad_order_id, status, address_snapshot,
 *                      courier, tracking_number, purchased_at, printed_at,
 *                      dispatched_at, delivered_at, returned_reason)
 * The address must be a SNAPSHOT taken at purchase, not a live join to
 * `vendor_profiles`: a vendor who moves after ordering would otherwise rewrite
 * the address on a parcel already in transit.
 */

export type CertStatus =
  | "processing"
  | "printed"
  | "dispatched"
  | "delivered"
  | "returned"
  | "cancelled";

export const CERT_STATUS_LABELS: Record<CertStatus, string> = {
  processing: "Processing",
  printed: "Printed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

/**
 * The forward path, in order. A status can only move to the next one, or to
 * `cancelled` / `returned`, which is why this is a list and not a free choice:
 * a certificate that goes from "delivered" back to "processing" is a data entry
 * mistake, not a workflow.
 */
export const CERT_PIPELINE: CertStatus[] = ["processing", "printed", "dispatched", "delivered"];

/** What the next forward step is, or null at the end of the pipeline. */
export function nextStatus(current: CertStatus): CertStatus | null {
  const i = CERT_PIPELINE.indexOf(current);
  if (i === -1 || i === CERT_PIPELINE.length - 1) return null;
  return CERT_PIPELINE[i + 1];
}

export interface CertificateOrder {
  id: string;
  reference: string;
  vendorName: string;
  /** Snapshot taken at purchase, not a live read of the vendor profile. */
  address: string;
  city: string;
  state: string;
  postalCode: string;
  contactName: string;
  contactPhone: string;
  purchasedAt: string;
  status: CertStatus;
  courier: string | null;
  trackingNumber: string | null;
  /** Set when a parcel comes back, so the tab shows why. */
  returnReason: string | null;
}

export const COURIERS = ["Blue Dart", "Delhivery", "DTDC", "India Post Speed Post", "Ekart", "Xpressbees"];

const SEED: CertificateOrder[] = [
  {
    id: "cert-seed-01",
    reference: "CERT-2609-041",
    vendorName: "Selvam Knit Mills",
    address: "18/3 Kumaran Road, Palladam Road industrial estate",
    city: "Tiruppur",
    state: "Tamil Nadu",
    postalCode: "641604",
    contactName: "R. Selvakumar",
    contactPhone: "+91 94430 21187",
    purchasedAt: daysAgo(1),
    status: "processing",
    courier: null,
    trackingNumber: null,
    returnReason: null,
  },
  {
    id: "cert-seed-02",
    reference: "CERT-2609-040",
    vendorName: "Devanshi Fabrics",
    address: "Shop 214, Millennium Textile Market 4, Ring Road",
    city: "Surat",
    state: "Gujarat",
    postalCode: "395002",
    contactName: "Devanshi Shah",
    contactPhone: "+91 98254 60932",
    purchasedAt: daysAgo(2),
    status: "processing",
    courier: null,
    trackingNumber: null,
    returnReason: null,
  },
  {
    id: "cert-seed-03",
    reference: "CERT-2609-039",
    vendorName: "Bhilwara Suitings Co",
    address: "Plot 7, RIICO Industrial Area, Phase II",
    city: "Bhilwara",
    state: "Rajasthan",
    postalCode: "311001",
    contactName: "Mahesh Jhanwar",
    contactPhone: "+91 94140 77321",
    purchasedAt: daysAgo(4),
    status: "printed",
    courier: null,
    trackingNumber: null,
    returnReason: null,
  },
  {
    id: "cert-seed-04",
    reference: "CERT-2609-038",
    vendorName: "Harkirat Hosiery",
    address: "B-XX 2140, Gill Road, near Ludhiana Hosiery Complex",
    city: "Ludhiana",
    state: "Punjab",
    postalCode: "141003",
    contactName: "Harkirat Singh Sethi",
    contactPhone: "+91 98146 33208",
    purchasedAt: daysAgo(6),
    status: "dispatched",
    courier: "Blue Dart",
    trackingNumber: "77219048362",
    returnReason: null,
  },
  {
    id: "cert-seed-05",
    reference: "CERT-2609-037",
    vendorName: "Gomti Silk House",
    address: "K 58/12 Madanpura, near Bunkar Colony",
    city: "Varanasi",
    state: "Uttar Pradesh",
    postalCode: "221001",
    contactName: "Imtiaz Ansari",
    contactPhone: "+91 90050 41276",
    purchasedAt: daysAgo(9),
    status: "dispatched",
    courier: "Delhivery",
    trackingNumber: "1429300551884",
    returnReason: null,
  },
  {
    id: "cert-seed-06",
    reference: "CERT-2609-036",
    vendorName: "Panipat Home Textiles",
    address: "Sector 29 Part II, HSIIDC Industrial Estate",
    city: "Panipat",
    state: "Haryana",
    postalCode: "132103",
    contactName: "Neeraj Bansal",
    contactPhone: "+91 99961 20447",
    purchasedAt: daysAgo(14),
    status: "delivered",
    courier: "DTDC",
    trackingNumber: "D80114927365",
    returnReason: null,
  },
  {
    id: "cert-seed-07",
    reference: "CERT-2609-035",
    vendorName: "Anagha Prints",
    address: "Chhipa Mohalla, near the block-print workshops",
    city: "Bagru",
    state: "Rajasthan",
    postalCode: "303007",
    contactName: "Anagha Deora",
    contactPhone: "+91 96490 18855",
    purchasedAt: daysAgo(17),
    status: "delivered",
    courier: "India Post Speed Post",
    trackingNumber: "EI734028196IN",
    returnReason: null,
  },
  {
    id: "cert-seed-08",
    reference: "CERT-2609-034",
    vendorName: "Kaveri Yarns",
    address: "112 Avinashi Road, Peelamedu",
    city: "Coimbatore",
    state: "Tamil Nadu",
    postalCode: "641004",
    contactName: "S. Kavitha",
    contactPhone: "+91 98422 70614",
    purchasedAt: daysAgo(21),
    status: "returned",
    courier: "Ekart",
    trackingNumber: "FMPP4419023715",
    returnReason: "Premises closed on three delivery attempts. Phone unanswered.",
  },
  {
    id: "cert-seed-09",
    reference: "CERT-2609-033",
    vendorName: "Trilok Fibres",
    address: "Warehouse 6, Kalyan Road, Kaneri",
    city: "Bhiwandi",
    state: "Maharashtra",
    postalCode: "421302",
    contactName: "Trilok Chandani",
    contactPhone: "+91 98203 55190",
    purchasedAt: daysAgo(26),
    status: "cancelled",
    courier: null,
    trackingNumber: null,
    returnReason: "Vendor cancelled before printing; the ad order was refunded.",
  },
];

export const certificateStore = createDevStore<CertificateOrder>(devSeed(SEED));

export function updateCertificate(id: string, patch: Partial<CertificateOrder>) {
  certificateStore.update((rows) => rows.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
