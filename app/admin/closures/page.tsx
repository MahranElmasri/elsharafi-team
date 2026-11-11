import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { formatRange } from "@/lib/dates";
import { berlinToday } from "@/lib/grid";
import { labels } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { ClosureForm } from "./ClosureForm";
import { RemoveClosure } from "./RemoveClosure";

export const metadata: Metadata = { title: `Schließungen – ${labels.practice}` };

interface Range {
  from: string;
  to: string;
  days: number;
  note: string | null;
}

/** Joins closure days into ranges when only weekends or holidays lie between them. */
function toRanges(days: { day: string; note: string | null }[], holidays: Set<string>): Range[] {
  const next = (key: string) => {
    const d = new Date(`${key}T12:00:00Z`);
    do d.setUTCDate(d.getUTCDate() + 1);
    while (
      d.getUTCDay() === 0 ||
      d.getUTCDay() === 6 ||
      holidays.has(d.toISOString().slice(0, 10))
    );
    return d.toISOString().slice(0, 10);
  };
  const out: Range[] = [];
  for (const { day, note } of days) {
    const last = out.at(-1);
    if (last && next(last.to) === day && last.note === note) {
      last.to = day;
      last.days++;
    } else {
      out.push({ from: day, to: day, days: 1, note });
    }
  }
  return out;
}

export default async function ClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const user = await requireUser("admin");
  const { jahr } = await searchParams;
  const today = berlinToday();
  const year = /^\d{4}$/.test(jahr ?? "") ? Number(jahr) : Number(today.slice(0, 4));

  const supabase = await createServerClient();
  const [closures, holidays, types] = await Promise.all([
    supabase
      .from("closure_days")
      .select("day, note")
      .gte("day", `${year}-01-01`)
      .lte("day", `${year}-12-31`)
      .order("day"),
    supabase.rpc("berlin_holidays", { y: year }),
    supabase.from("absence_types").select("code, label"),
  ]);
  if (closures.error) throw new Error(closures.error.message);
  const ranges = toRanges(
    closures.data ?? [],
    new Set(((holidays.data ?? []) as { day: string }[]).map((h) => h.day)),
  );

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-3xl gap-10 px-4 py-8">
        <header className="grid gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Schließungen</h1>
          <p className="text-ink-2">
            Betriebsurlaub einmal eintragen statt für jede Person einzeln.
          </p>
        </header>

        <section
          aria-label="Schließung eintragen"
          className="grid gap-4 border-t-2 border-ink pt-6"
        >
          <h2 className="text-xl font-bold">Schließung eintragen</h2>
          <ClosureForm
            today={today}
            types={Object.fromEntries((types.data ?? []).map((t) => [t.code, t.label]))}
          />
        </section>

        <section
          aria-label={`Schließungen ${year}`}
          className="grid gap-4 border-t-2 border-ink pt-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Schließungen {year}</h2>
            <nav className="flex gap-4 text-sm" aria-label="Jahr">
              <Link href={`?jahr=${year - 1}`} className="btn-plain">
                {year - 1}
              </Link>
              <Link href={`?jahr=${year + 1}`} className="btn-plain">
                {year + 1}
              </Link>
            </nav>
          </div>
          {ranges.length === 0 ? (
            <p className="text-ink-2">Für {year} ist keine Schließung eingetragen.</p>
          ) : (
            <ul className="grid gap-2">
              {ranges.map((r) => {
                const label = `${formatRange(r.from, r.to)}${r.to.slice(0, 4)}`;
                return (
                  <li
                    key={r.from}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-sheet p-3"
                  >
                    <div>
                      <b className="block">{label}</b>
                      <span className="text-sm text-ink-2">
                        {r.days} {r.days === 1 ? "Schließtag" : "Schließtage"}
                        {r.note && `, ${r.note}`}
                      </span>
                    </div>
                    <RemoveClosure from={r.from} to={r.to} label={label} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
