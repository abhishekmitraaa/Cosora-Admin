/**
 * Rupees from paise, with its sign, Indian digit grouping and no decimals.
 *
 * The payments ledger returns every amount in paise (the database converts
 * subscription_invoices' rupees), so this is the only conversion the page does.
 * See README → "Money: units are not uniform" for why that matters.
 */
export function inrFromPaise(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "-" : "";
  return `${sign}₹${Math.abs(rupees).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
