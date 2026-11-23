type Res = { data: unknown; error?: { message: string } | null };

/**
 * The data of a query result, or a throw (the route's error page) when the read failed. A failed
 * read must never become "empty", "zero" or "not found": `null` is returned only for a successful
 * read that matched nothing (a `maybeSingle` with no row).
 */
export function read<R extends Res>(res: R): NonNullable<R["data"]> | null {
  if (res.error) throw new Error(`read failed: ${res.error.message}`);
  return res.data as NonNullable<R["data"]> | null;
}

/** Rows of a successful list read; throws when the read failed. */
export function readRows<R extends { data: unknown[] | null; error?: { message: string } | null }>(
  res: R,
): NonNullable<R["data"]> {
  return (read(res) ?? []) as NonNullable<R["data"]>;
}
