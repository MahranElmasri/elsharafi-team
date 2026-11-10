"use client";

import { useMemo, useState } from "react";
import { Stamp } from "@/components/Stamp";
import { formatDays } from "@/lib/dates";
import { stampTilt, worksOn, WEEKDAY_LONG, WEEKDAY_SHORT, type DayColumn } from "@/lib/grid";

export interface GridPerson {
  id: string;
  name: string;
  teamId: string;
  active: boolean;
  workdays: number[];
  startDate: string;
  endDate: string | null;
  sick: number;
  taken: number;
  remaining: number;
  pending: number;
  hasAllowance: boolean;
}

export interface GridEntry {
  type: string;
  status: "pending" | "approved";
  half: "am" | "pm" | null;
}

export interface GridType {
  letter: string;
  label: string;
  color: string;
}

export interface GridData {
  columns: DayColumn[];
  people: GridPerson[];
  entries: Record<string, GridEntry>; // "userId|2026-11-17"
  notes: Record<string, string>;
  auMissing: string[];
  types: Record<string, GridType>;
  teams: { id: string; name: string; maxAbsent: number }[];
  load: Record<string, number>; // "teamId|2026-11-17" → absent people
  year: number;
  settings: { halfDays: boolean; auTracking: boolean };
}

const ALL = "alle";

/** The admin's month sheet (R2). Read-only here; editing comes with T12. */
export function AttendanceGrid({ data }: { data: GridData }) {
  const [team, setTeam] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const auMissing = useMemo(() => new Set(data.auMissing), [data.auMissing]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: data.people.length };
    for (const p of data.people) c[p.teamId] = (c[p.teamId] ?? 0) + 1;
    return c;
  }, [data.people]);

  const q = query.trim().toLocaleLowerCase("de");
  const people = data.people.filter(
    (p) => (team === ALL || p.teamId === team) && p.name.toLocaleLowerCase("de").includes(q),
  );
  const selectedTeam = data.teams.find((t) => t.id === team);
  const y = data.year;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Gruppe"
          className="flex overflow-hidden rounded-[10px] border border-rule bg-sheet"
        >
          {[...data.teams, { id: ALL, name: "Alle" }].map((t, i) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={team === t.id}
              onClick={() => setTeam(t.id)}
              className={`px-3.5 py-2 font-medium ${i > 0 ? "border-l border-rule" : ""} ${
                team === t.id ? "bg-ink text-on-ink" : "text-ink-2"
              }`}
            >
              {t.name}
              <small className="ml-1 opacity-70">{counts[t.id] ?? 0}</small>
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="grid-search">
          Name suchen
        </label>
        <input
          id="grid-search"
          type="search"
          placeholder="Name suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-52 max-w-full rounded-[10px] border border-rule bg-sheet px-3 py-2"
        />
      </div>

      <Legend data={data} />

      <div className="roster-sheet">
        <table className="roster">
          <thead>
            <tr>
              <th scope="col" className="who">
                <div className="flex items-end justify-between gap-3 text-sm text-ink-2">
                  <span>Name und Arbeitstage</span>
                  <span className="grid grid-cols-[repeat(3,40px)] text-center font-bold">
                    <abbr className="no-underline" title={`Krankheitstage ${y}`}>
                      X
                    </abbr>
                    <abbr className="no-underline" title={`Urlaub genommen ${y}`}>
                      U
                    </abbr>
                    <abbr className="no-underline" title={`Resturlaub ${y}`}>
                      Rest
                    </abbr>
                  </span>
                </div>
              </th>
              {data.columns.map((c) => {
                const absent = selectedTeam ? (data.load[`${selectedTeam.id}|${c.key}`] ?? 0) : 0;
                const over = selectedTeam && absent > selectedTeam.maxAbsent;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={columnClass(c)}
                    title={c.holiday ?? undefined}
                  >
                    <span className="block text-xs text-ink-2">{WEEKDAY_SHORT[c.weekday]}</span>
                    <span className="block text-[17px] font-bold">{c.day}</span>
                    {c.holiday && (
                      <span className="block text-[10px] leading-tight font-bold text-krank">
                        {c.holiday.length > 12 ? "Feiertag" : c.holiday}
                      </span>
                    )}
                    {c.isToday && (
                      <span className="block text-[10px] leading-tight font-extrabold">heute</span>
                    )}
                    {over && (
                      <span
                        className="over"
                        title={`${absent} abwesend, erlaubt sind ${selectedTeam.maxAbsent}`}
                      >
                        {absent} von {selectedTeam.maxAbsent}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={data.columns.length + 1} className="px-4 py-7 text-ink-2">
                  {query
                    ? `Niemand passt zur Suche „${query}“. Ändern Sie die Suche oder wählen Sie „Alle“.`
                    : "In dieser Gruppe ist niemand eingetragen."}
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="who">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <b
                        className={`max-w-[170px] truncate ${p.active ? "" : "text-pencil"}`}
                        title={p.name}
                      >
                        {p.name}
                      </b>
                      <span
                        className="flex gap-[3px]"
                        title={`Arbeitstage: ${p.workdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}`}
                      >
                        {[1, 2, 3, 4, 5].map((d) => (
                          <i
                            key={d}
                            className={`size-[9px] rounded-full border-[1.5px] border-ink-2 ${
                              p.workdays.includes(d) ? "bg-ink-2" : ""
                            }`}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="grid grid-cols-[repeat(3,40px)] text-center font-bold">
                      <span
                        className="text-krank"
                        aria-label={`${formatDays(p.sick)} Krankheitstage`}
                      >
                        {formatDays(p.sick)}
                      </span>
                      <span
                        className="text-urlaub"
                        aria-label={`${formatDays(p.taken)} Urlaubstage genommen`}
                      >
                        {formatDays(p.taken)}
                      </span>
                      {p.hasAllowance ? (
                        <span
                          className={p.remaining <= 3 ? "text-krank" : ""}
                          title={`${formatDays(p.pending)} Tage beantragt`}
                          aria-label={`${formatDays(p.remaining)} Tage Resturlaub`}
                        >
                          {formatDays(p.remaining)}
                        </span>
                      ) : (
                        <span
                          className="text-pencil"
                          title={`Kein Urlaubsanspruch für ${y} eingetragen`}
                        >
                          –
                        </span>
                      )}
                    </div>
                  </div>
                </th>
                {data.columns.map((c) => {
                  const key = `${p.id}|${c.key}`;
                  const works = worksOn(p, c);
                  const entry = data.entries[key];
                  const type = entry ? data.types[entry.type] : undefined;
                  const note = data.notes[key];
                  return (
                    <td
                      key={c.key}
                      className={`${columnClass(c)} ${!works && !c.holiday ? "off" : ""}`}
                    >
                      <div className="cell">
                        {entry && type && (
                          <Stamp
                            letter={type.letter}
                            color={type.color}
                            pending={entry.status === "pending"}
                            half={entry.half}
                            tilt={stampTilt(key)}
                            showHalfMark={data.settings.halfDays}
                          />
                        )}
                        {note && <span className="note-dot" title={note} />}
                        {auMissing.has(key) && <span className="au-miss" title="AU fehlt" />}
                        <span className="sr-only">
                          {`${p.name}, ${WEEKDAY_LONG[c.weekday]} ${c.day}.: ${cellText(c, works, entry, type)}`}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function columnClass(c: DayColumn) {
  return [
    "day",
    c.isFriday && "fri",
    c.isMonthStart && "month-start",
    c.holiday && "hol",
    c.isToday && "today",
  ]
    .filter(Boolean)
    .join(" ");
}

function cellText(c: DayColumn, works: boolean, entry?: GridEntry, type?: GridType) {
  if (c.holiday) return c.holiday;
  if (!works) return "kein Arbeitstag";
  if (!entry || !type) return "frei";
  const half = entry.half === "am" ? ", vormittags" : entry.half === "pm" ? ", nachmittags" : "";
  return `${type.label}${half}${entry.status === "pending" ? ", beantragt" : ""}`;
}

function Legend({ data }: { data: GridData }) {
  const sick = data.types.sick;
  const vacation = data.types.vacation;
  const swatch = "inline-block size-[22px] rounded border border-rule";
  return (
    <div
      aria-label="Legende"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2"
    >
      {sick && (
        <span className="inline-flex items-center gap-2">
          <Stamp letter={sick.letter} color={sick.color} />
          {sick.label}
        </span>
      )}
      {vacation && (
        <>
          <span className="inline-flex items-center gap-2">
            <Stamp letter={vacation.letter} color={vacation.color} />
            {vacation.label} genehmigt
          </span>
          <span className="inline-flex items-center gap-2">
            <Stamp letter={vacation.letter} color={vacation.color} pending />
            {vacation.label} beantragt
          </span>
          {data.settings.halfDays && (
            <span className="inline-flex items-center gap-2">
              <Stamp letter={vacation.letter} color={vacation.color} half="am" />
              halber Tag
            </span>
          )}
        </>
      )}
      <span className="inline-flex items-center gap-2">
        <span
          className={`${swatch} bg-[repeating-linear-gradient(135deg,var(--hatch)_0_4px,transparent_4px_8px)]`}
        />
        kein Arbeitstag
      </span>
      <span className="inline-flex items-center gap-2">
        <span className={`${swatch} bg-[var(--holiday)]`} />
        Feiertag
      </span>
      <span className="inline-flex items-center gap-2">
        <span className={`${swatch} bg-[var(--today)]`} />
        heute
      </span>
      {data.settings.auTracking && (
        <span className="inline-flex items-center gap-2">
          <span className={`${swatch} relative`}>
            <span className="absolute top-0 left-0 border-t-[11px] border-r-[11px] border-t-krank border-r-transparent" />
          </span>
          AU fehlt
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <span className="inline-block size-[9px] rounded-full bg-[var(--note)]" />
        Notiz
      </span>
    </div>
  );
}
