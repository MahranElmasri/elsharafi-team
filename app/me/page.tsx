import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { AppHeader } from "@/components/AppHeader";
import { MeActions } from "@/components/me/MeActions";
import { MonthCalendar } from "@/components/me/MonthCalendar";
import { RequestList } from "@/components/me/RequestList";
import { TeamCalendar } from "@/components/me/TeamCalendar";
import { WorkdayCircles } from "@/components/WorkdayCircles";
import { formatDays } from "@/lib/dates";
import { berlinToday, monthParam, MONTHS, parseMonth, shiftMonth } from "@/lib/grid";
import { labels } from "@/lib/labels";
import { loadMeData } from "@/lib/me-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: `Meine Abwesenheiten – ${labels.practice}` };

const days = (n: number) => `${formatDays(n)} ${n === 1 ? "Tag" : "Tage"}`;

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; ansicht?: string }>;
}) {
  const user = await requireUser();
  const { monat, ansicht } = await searchParams;
  const today = berlinToday();
  const { year, month } = parseMonth(monat, today);
  const data = await loadMeData(user.id, year, month, today);
  const showTeam = ansicht === "team" && data.settings.teamCalendar;
  const b = data.balance;

  const href = (m: { year: number; month: number }, view = showTeam ? "team" : undefined) =>
    `/me?monat=${monthParam(m.year, m.month)}${view ? `&ansicht=${view}` : ""}`;
  const here = { year, month };
  const arrow = "grid size-[34px] place-items-center rounded-full border border-rule bg-sheet";
  const tab = (on: boolean) =>
    `-mb-px border-b-[3px] px-3.5 py-2.5 font-bold ${on ? "border-ink text-ink" : "border-transparent text-ink-2"}`;
  const others = Object.entries(b.byType).filter(
    ([code, n]) =>
      n > 0 && !data.types[code]?.deductsVacation && code !== "sick" && code !== "child_sick",
  );

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-xl gap-6 px-4 py-6">
        <section className="grid gap-1" aria-labelledby="hello">
          <p id="hello" className="text-ink-2">
            Guten Tag, {user.fullName}
          </p>
          {data.hasAllowance ? (
            <>
              <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
                Sie haben noch {days(b.available)} Urlaub.
              </h1>
              <p className="text-sm text-ink-2">
                {formatDays(b.taken)} genommen, {formatDays(b.pending)} beantragt. Anspruch{" "}
                {days(b.allowance)}
                {b.carryover > 0 && ` und ${days(b.carryover)} aus dem Vorjahr`} für {data.year}.
              </p>
            </>
          ) : (
            <h1 className="text-[24px] leading-tight font-extrabold tracking-tight">
              Für {data.year} ist noch kein Urlaubsanspruch eingetragen. Bitte wenden Sie sich an
              die Praxisleitung.
            </h1>
          )}
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-ink-2">Alle Zahlen für {data.year}</summary>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
              <dt>Anspruch</dt>
              <dd>{days(b.allowance)}</dd>
              <dt>Aus dem Vorjahr</dt>
              <dd>{days(b.carryover)}</dd>
              {b.carryover > 0 && (
                <>
                  <dt className="pl-3 text-ink-2">davon bis 31.3. genommen</dt>
                  <dd>{days(b.carryoverUsed)}</dd>
                  <dt className="pl-3 text-ink-2">davon verfallen</dt>
                  <dd>{days(b.carryoverExpired)}</dd>
                </>
              )}
              <dt>Genommen</dt>
              <dd>{days(b.taken)}</dd>
              <dt>Beantragt</dt>
              <dd>{days(b.pending)}</dd>
              <dt className="font-bold">Noch verfügbar</dt>
              <dd className="font-bold">{days(b.available)}</dd>
              <dt>Krankheitstage</dt>
              <dd>{days(b.sick)}</dd>
              {others.map(([code, n]) => (
                <Fragment key={code}>
                  <dt>{data.types[code]?.label ?? code}</dt>
                  <dd>{days(n)}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        </section>

        <section className="grid gap-2" aria-label="Ihre Arbeitstage">
          <WorkdayCircles workdays={data.profile.workdays} />
          <p className="text-[13px] text-ink-2">
            Ihre Arbeitstage. Urlaub zählt nur an diesen Tagen.
          </p>
        </section>

        <MeActions data={data} today={today} />

        <section className="grid gap-3" aria-label="Kalender">
          {data.settings.teamCalendar && (
            <nav className="flex border-b border-rule" aria-label="Ansicht">
              <Link
                href={href(here, undefined)}
                aria-current={!showTeam ? "page" : undefined}
                className={tab(!showTeam)}
              >
                Mein Kalender
              </Link>
              <Link
                href={href(here, "team")}
                aria-current={showTeam ? "page" : undefined}
                className={tab(showTeam)}
              >
                Team
              </Link>
            </nav>
          )}
          <div className="flex items-center justify-between">
            <Link
              href={href(shiftMonth(year, month, -1))}
              className={arrow}
              aria-label="Vorheriger Monat"
            >
              ‹
            </Link>
            <h2 className="text-lg font-bold">
              {MONTHS[month - 1]} {year}
            </h2>
            <Link
              href={href(shiftMonth(year, month, 1))}
              className={arrow}
              aria-label="Nächster Monat"
            >
              ›
            </Link>
          </div>
          {showTeam ? <TeamCalendar data={data} /> : <MonthCalendar data={data} />}
        </section>

        <section className="grid gap-2" aria-labelledby="mine-h">
          <h2 id="mine-h" className="text-lg font-bold">
            Meine Anträge {data.year}
          </h2>
          <RequestList data={data} />
        </section>
      </main>
    </>
  );
}
