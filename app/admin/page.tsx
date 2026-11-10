import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AttendanceGrid } from "@/components/AttendanceGrid";
import { berlinToday, monthParam, MONTHS, parseMonth, shiftMonth } from "@/lib/grid";
import { loadGridData } from "@/lib/grid-data";
import { labels } from "@/lib/labels";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: `${labels.nav.overview} – ${labels.practice}` };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const user = await requireUser("admin");
  const { monat } = await searchParams;
  const { year, month } = parseMonth(monat, berlinToday());
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const data = await loadGridData(year, month);
  const arrow =
    "grid size-10 place-items-center rounded-full border border-rule bg-sheet text-xl leading-none";

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-screen-2xl gap-5 px-4 py-6">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin?monat=${monthParam(prev.year, prev.month)}`}
            className={arrow}
            aria-label="Vorheriger Monat"
          >
            ‹
          </Link>
          <h1 className="min-w-[8.6ch] text-center text-[clamp(30px,3.4vw,44px)] leading-none font-extrabold tracking-[-0.025em]">
            {MONTHS[month - 1]} {year}
          </h1>
          <Link
            href={`/admin?monat=${monthParam(next.year, next.month)}`}
            className={arrow}
            aria-label="Nächster Monat"
          >
            ›
          </Link>
        </div>
        <AttendanceGrid data={data} />
      </main>
    </>
  );
}
