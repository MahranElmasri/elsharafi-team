import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST returns at most max_rows (1000) per request, so long reads go page by page,
// ordered by the primary key so no row is skipped or read twice.
const PAGE = 1000;

export async function readAll<T>(
  supabase: SupabaseClient,
  table: string,
  key: string[],
  select = "*",
  filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => typeof q = (q) => q,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = filter(supabase.from(table).select(select));
    for (const k of key) query = query.order(k);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE) return rows;
  }
}
