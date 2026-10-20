/**
 * Every row of a list, read in pages.
 *
 * PostgREST answers at most 1,000 rows a request (Supabase's max_rows) and says nothing when it stops
 * there, so a whole-table read just loses the rows past it: on Certificates the newest orders, the ones
 * waiting to be printed; on Vendors the brands late in the alphabet (2026-10-20 admin audit). `page`
 * must order by something unique (add the id as a tie-breaker), or a row can repeat or vanish between
 * pages.
 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) return all;
  }
}
