import { Button } from "@/components/ui";

/** "Load more" under a paged list (useInfiniteQuery). Shows nothing once the last page is in. */
export function LoadMore({
  query,
  label = "Load more",
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
  label?: string;
}) {
  if (!query.hasNextPage) return null;
  return (
    <div className="flex justify-center pt-1">
      <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
        {query.isFetchingNextPage ? "Loading…" : label}
      </Button>
    </div>
  );
}
