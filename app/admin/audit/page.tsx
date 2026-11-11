import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AREAS, changes, describe, type AuditEntry, type Lookup } from "@/lib/audit";
import { labels } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: `Protokoll – ${labels.practice}` };

const PAGE = 50;
const UUID = /^[0-9a-f-]{36}$/;
const when = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

/** Every change to absences, requests, people, allowances and closures (R20). Admins only. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ seite?: string; bereich?: string; person?: string }>;
}) {
  const user = await requireUser("admin");
  const params = await searchParams;
  const page = Math.max(1, Number(params.seite) || 1);
  const area = params.bereich && AREAS[params.bereich] ? params.bereich : "";
  const person = params.person && UUID.test(params.person) ? params.person : "";

  const supabase = await createServerClient();
  let query = supabase
    .from("audit_log")
    .select("id, actor, table_name, row_key, action, old, new, at", { count: "exact" })
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (area) query = query.eq("table_name", area);
  if (person) {
    query = query.or(
      `row_key.like.${person}*,new->>user_id.eq.${person},old->>user_id.eq.${person}`,
    );
  }
  const [log, people, types] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("absence_types").select("code, label"),
  ]);
  if (log.error) throw new Error(log.error.message);

  const entries = (log.data ?? []) as AuditEntry[];
  const lookup: Lookup = {
    names: Object.fromEntries((people.data ?? []).map((p) => [p.id, p.full_name])),
    types: Object.fromEntries((types.data ?? []).map((t) => [t.code, t.label])),
  };
  const total = log.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (area) q.set("bereich", area);
    if (person) q.set("person", person);
    if (p > 1) q.set("seite", String(p));
    return `/admin/audit${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-screen-xl gap-6 px-4 py-8">
        <header className="grid gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Protokoll</h1>
          <p className="text-ink-2">
            Jede Änderung mit Zeit, Person und Inhalt vorher und nachher. Nur die Praxisleitung
            sieht das Protokoll.
          </p>
        </header>

        <form className="flex flex-wrap items-end gap-3" aria-label="Filter">
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="audit-area">Bereich</label>
            <select id="audit-area" name="bereich" defaultValue={area} className="field">
              <option value="">Alle Bereiche</option>
              {Object.entries(AREAS).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="audit-person">Person</label>
            <select id="audit-person" name="person" defaultValue={person} className="field">
              <option value="">Alle Personen</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-ink">
            Anzeigen
          </button>
          {(area || person) && (
            <Link href="/admin/audit" className="btn-plain self-center">
              Filter zurücksetzen
            </Link>
          )}
        </form>

        <p className="text-sm text-ink-2" role="status">
          {total} {total === 1 ? "Eintrag" : "Einträge"}
          {pages > 1 && `, Seite ${page} von ${pages}`}
        </p>

        {entries.length === 0 ? (
          <p className="text-ink-2">Keine Einträge für diese Auswahl.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-rule bg-sheet">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-ink-2">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Zeit
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Wer
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Bereich
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Was
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Änderung
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-rule align-top last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {when.format(new Date(e.at))}
                    </td>
                    <td className="px-3 py-2">
                      {e.actor ? (lookup.names[e.actor] ?? "gelöschte Person") : "System"}
                    </td>
                    <td className="px-3 py-2">{AREAS[e.table_name] ?? e.table_name}</td>
                    <td className="px-3 py-2">{describe(e, lookup)}</td>
                    <td className="px-3 py-2">
                      <ul className="grid gap-0.5">
                        {changes(e, lookup).map((c) => (
                          <li key={c.field}>
                            <span className="text-ink-2">{c.field}:</span>{" "}
                            {c.before !== null && c.after !== null ? (
                              <>
                                <del className="text-ink-2">{c.before}</del> → {c.after}
                              </>
                            ) : (
                              (c.after ?? <del className="text-ink-2">{c.before}</del>)
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav className="flex gap-4" aria-label="Seiten">
            {page > 1 && (
              <Link href={href(page - 1)} className="btn-plain">
                Neuere
              </Link>
            )}
            {page < pages && (
              <Link href={href(page + 1)} className="btn-plain">
                Ältere
              </Link>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
