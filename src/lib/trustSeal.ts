/**
 * Mirrors `trustSealFromParts` in textile-spark-net's src/lib/plan.ts. Kept as a
 * copy rather than an import because the two repos don't share a package — if
 * the buyer-side rule changes, this must change with it or the admin panel will
 * explain a seal the buyer isn't actually seeing.
 *
 * The displayed seal is the OR of three INDEPENDENT sources:
 *   1. is_verified        — manual admin verification (this panel's toggle)
 *   2. plan_expires_at    — an active paid subscription (every paid tier grants it)
 *   3. ad_verified_until  — an active ad-purchased seal (trustedSeal / verifiedCertificate)
 *
 * None of them writes another's column, so turning the admin flag off does NOT
 * remove a seal granted by a live subscription or an ad purchase. Surfacing all
 * three together is the point of the vendor list: it makes "why is this vendor
 * showing a seal?" answerable at a glance.
 */

export function futureTs(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

export function trustSealFromParts(
  isVerified: boolean | null | undefined,
  planExpiresAt: string | null | undefined,
  adVerifiedUntil?: string | null | undefined,
): boolean {
  return Boolean(isVerified) || futureTs(planExpiresAt) || futureTs(adVerifiedUntil);
}

export interface SealSources {
  admin: boolean;
  subscription: boolean;
  ad: boolean;
  any: boolean;
}

/** Which of the three sources are currently granting the seal. */
export function sealSources(
  isVerified: boolean | null | undefined,
  planExpiresAt: string | null | undefined,
  adVerifiedUntil: string | null | undefined,
): SealSources {
  const admin = Boolean(isVerified);
  const subscription = futureTs(planExpiresAt);
  const ad = futureTs(adVerifiedUntil);
  return { admin, subscription, ad, any: admin || subscription || ad };
}
