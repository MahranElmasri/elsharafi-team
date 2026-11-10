"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { listDays, saveNote, setAu, setCell, type GridResult } from "@/app/actions/grid";
import { openRequest } from "@/components/admin/ApprovalsDrawer";
import { GridMenu, type MenuActions } from "@/components/GridMenu";
import { Stamp } from "@/components/Stamp";
import { formatDays } from "@/lib/dates";
import {
  groupDays,
  nextInCycle,
  stampTilt,
  worksOn,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type DayColumn,
} from "@/lib/grid";

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
  auReceived: boolean;
  requestId?: string | null;
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
  menuTypes: string[]; // visible types, in their sort order
  teams: { id: string; name: string; maxAbsent: number }[];
  load: Record<string, number>; // "teamId|2026-11-17" → absent people
  year: number;
  settings: { halfDays: boolean; auTracking: boolean };
}

const ALL = "alle";

type MenuState = { person: GridPerson; column: DayColumn; x: number; y: number };
type CountState = {
  person: GridPerson;
  kind: "sick" | "vacation";
  x: number;
  y: number;
  text?: string;
};

/** The admin's month sheet (R2): click to cycle X → U → frei, right-click for everything else. */
export function AttendanceGrid({ data }: { data: GridData }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [team, setTeam] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState(data.entries);
  const [notes, setNotes] = useState(data.notes);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [count, setCount] = useState<CountState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const inFlight = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);

  // A refresh brings the server's truth (counts, AU runs); it replaces the optimistic state.
  useEffect(() => setEntries(data.entries), [data.entries]);
  useEffect(() => setNotes(data.notes), [data.notes]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

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

  /** Show the change at once, save it, and undo it with the database's message if refused. */
  async function write(
    key: string,
    next: GridEntry | undefined,
    call: () => Promise<GridResult>,
    ok?: string,
  ) {
    const before = entries[key];
    const put = (value: GridEntry | undefined) =>
      setEntries((e) => {
        const n = { ...e };
        if (value) n[key] = value;
        else delete n[key];
        return n;
      });
    put(next);
    inFlight.current++;
    const res = await call();
    inFlight.current--;
    if (res.error) {
      put(before);
      setPressed(null);
      setToast(res.error);
    } else if (ok) {
      setToast(ok);
    }
    if (inFlight.current === 0) startRefresh(() => router.refresh());
  }

  function cellBlocked(person: GridPerson, column: DayColumn) {
    if (column.holiday) return `${column.holiday}: An Feiertagen wird nichts eingetragen.`;
    if (!worksOn(person, column)) return `${person.name} arbeitet an diesem Tag nicht.`;
    return null;
  }

  function openMenu(person: GridPerson, column: DayColumn, x: number, y: number) {
    const blocked = cellBlocked(person, column);
    if (blocked) return setToast(blocked);
    setCount(null);
    setMenu({ person, column, x, y });
  }

  function cellAt(r: number, c: number) {
    return tableRef.current?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`);
  }

  function onCellClick(person: GridPerson, column: DayColumn, button: HTMLElement) {
    const blocked = cellBlocked(person, column);
    if (blocked) return setToast(blocked);
    const key = `${person.id}|${column.key}`;
    const step = nextInCycle(entries[key]);
    if (step.kind === "pending") {
      const id = entries[key]?.requestId;
      if (id) return openRequest(id);
      return setToast("Für diesen Tag liegt ein offener Antrag vor. Entscheiden Sie im Antrag.");
    }
    if (step.kind === "menu") {
      const r = button.getBoundingClientRect();
      return openMenu(person, column, r.left, r.bottom + 6);
    }
    const next = step.type
      ? { type: step.type, status: "approved" as const, half: null, auReceived: false }
      : undefined;
    setPressed(step.type ? key : null);
    void write(key, next, () => setCell(person.id, column.key, step.type, null));
  }

  function onCellKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const nr = Math.min(Math.max(r + moves[e.key][0], 0), people.length - 1);
      const nc = Math.min(Math.max(c + moves[e.key][1], 0), data.columns.length - 1);
      setFocus({ r: nr, c: nc });
      cellAt(nr, nc)?.focus();
      return;
    }
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      openMenu(people[r], data.columns[c], rect.left, rect.bottom + 6);
    }
  }

  function closeMenu() {
    if (menu) {
      const r = people.findIndex((p) => p.id === menu.person.id);
      const c = data.columns.findIndex((col) => col.key === menu.column.key);
      queueMicrotask(() => cellAt(r, c)?.focus());
    }
    setMenu(null);
  }

  function buildMenuActions(): MenuActions | null {
    if (!menu) return null;
    const { person, column } = menu;
    const key = `${person.id}|${column.key}`;
    const entry = entries[key];
    const done = (fn: () => void) => () => {
      fn();
      closeMenu();
    };
    return {
      close: closeMenu,
      chooseType: (type) =>
        done(() => {
          const half = data.settings.halfDays ? (entry?.half ?? null) : null;
          setPressed(key);
          void write(
            key,
            {
              type,
              status: "approved",
              half,
              auReceived: entry?.type === type && entry.auReceived,
            },
            () => setCell(person.id, column.key, type, half),
            `${data.types[type].label} eingetragen.`,
          );
        })(),
      setHalf: (half) =>
        done(() => {
          if (!entry) return;
          void write(key, { ...entry, half }, () =>
            setCell(person.id, column.key, entry.type, half),
          );
        })(),
      setAu: (received) =>
        done(() => {
          if (!entry) return;
          inFlight.current++;
          setEntries((e) => ({ ...e, [key]: { ...entry, auReceived: received } }));
          void setAu(person.id, column.key, received).then((res) => {
            inFlight.current--;
            if (res.error) {
              setEntries((e) => ({ ...e, [key]: entry }));
              setToast(res.error);
            } else {
              setToast(
                received
                  ? `AU liegt vor, für ${res.days} Krankheitstage.`
                  : "AU als fehlend markiert.",
              );
            }
            if (inFlight.current === 0) startRefresh(() => router.refresh());
          });
        })(),
      remove: () =>
        done(() => {
          void write(
            key,
            undefined,
            () => setCell(person.id, column.key, null, null),
            "Eintrag entfernt.",
          );
        })(),
      saveNote: (note) =>
        done(() => {
          const before = notes[key];
          setNotes((n) => {
            const copy = { ...n };
            if (note) copy[key] = note;
            else delete copy[key];
            return copy;
          });
          void saveNote(person.id, column.key, note).then((res) => {
            if (res.error) {
              setNotes((n) => ({ ...n, ...(before ? { [key]: before } : {}) }));
              setToast(res.error);
            } else {
              setToast(note ? "Notiz gespeichert." : "Notiz entfernt.");
            }
          });
        })(),
    };
  }
  const menuActions = buildMenuActions();

  async function showCount(person: GridPerson, kind: "sick" | "vacation", el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setMenu(null);
    setCount({ person, kind, x: r.left, y: r.bottom + 6 });
    const res = await listDays(person.id, y, kind);
    setCount((cur) =>
      cur && cur.person.id === person.id && cur.kind === kind
        ? { ...cur, text: res.error ?? (res.days?.length ? groupDays(res.days) : "Keine Tage.") }
        : cur,
    );
  }

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
              onClick={() => {
                setTeam(t.id);
                setFocus({ r: 0, c: 0 });
              }}
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
          onChange={(e) => {
            setQuery(e.target.value);
            setFocus({ r: 0, c: 0 });
          }}
          className="w-52 max-w-full rounded-[10px] border border-rule bg-sheet px-3 py-2"
        />
      </div>

      <Legend data={data} />

      <div className="roster-sheet">
        <table className="roster" ref={tableRef}>
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
            {people.map((p, r) => (
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
                      <button
                        type="button"
                        className="rounded-md py-1.5 text-krank hover:bg-[var(--hatch)]"
                        aria-label={`${formatDays(p.sick)} Krankheitstage, Daten anzeigen`}
                        onClick={(e) => showCount(p, "sick", e.currentTarget)}
                      >
                        {formatDays(p.sick)}
                      </button>
                      <button
                        type="button"
                        className="rounded-md py-1.5 text-urlaub hover:bg-[var(--hatch)]"
                        aria-label={`${formatDays(p.taken)} Urlaubstage genommen, Daten anzeigen`}
                        onClick={(e) => showCount(p, "vacation", e.currentTarget)}
                      >
                        {formatDays(p.taken)}
                      </button>
                      {p.hasAllowance ? (
                        <span
                          className={`py-1.5 ${p.remaining <= 3 ? "text-krank" : ""}`}
                          title={`${formatDays(p.pending)} Tage beantragt`}
                          aria-label={`${formatDays(p.remaining)} Tage Resturlaub`}
                        >
                          {formatDays(p.remaining)}
                        </span>
                      ) : (
                        <span
                          className="py-1.5 text-pencil"
                          title={`Kein Urlaubsanspruch für ${y} eingetragen`}
                        >
                          –
                        </span>
                      )}
                    </div>
                  </div>
                </th>
                {data.columns.map((c, ci) => {
                  const key = `${p.id}|${c.key}`;
                  const works = worksOn(p, c);
                  const entry = entries[key];
                  const type = entry ? data.types[entry.type] : undefined;
                  const note = notes[key];
                  const missing =
                    data.settings.auTracking && auMissing.has(key) && !entry?.auReceived;
                  return (
                    <td
                      key={c.key}
                      className={`${columnClass(c)} ${!works && !c.holiday ? "off" : ""}`}
                    >
                      <button
                        type="button"
                        className="cell"
                        data-r={r}
                        data-c={ci}
                        tabIndex={focus.r === r && focus.c === ci ? 0 : -1}
                        aria-disabled={!works || !!c.holiday || undefined}
                        aria-label={`${p.name}, ${WEEKDAY_LONG[c.weekday]} ${c.day}.: ${cellText(c, works, entry, type)}${note ? `, Notiz: ${note}` : ""}${missing ? ", AU fehlt" : ""}`}
                        onFocus={() => setFocus({ r, c: ci })}
                        onClick={(e) => onCellClick(p, c, e.currentTarget)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openMenu(p, c, e.clientX, e.clientY);
                        }}
                        onKeyDown={(e) => onCellKeyDown(e, r, ci)}
                      >
                        {entry && type && (
                          <Stamp
                            letter={type.letter}
                            color={type.color}
                            pending={entry.status === "pending"}
                            half={entry.half}
                            tilt={stampTilt(key)}
                            showHalfMark={data.settings.halfDays}
                            press={pressed === key}
                          />
                        )}
                        {note && <span className="note-dot" title={note} />}
                        {missing && <span className="au-miss" title="AU fehlt" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menu && menuActions && (
        <GridMenu
          key={`${menu.person.id}|${menu.column.key}`}
          title={`${menu.person.name}, ${WEEKDAY_SHORT[menu.column.weekday]} ${menu.column.day}.`}
          at={{ x: menu.x, y: menu.y }}
          entry={entries[`${menu.person.id}|${menu.column.key}`]}
          note={notes[`${menu.person.id}|${menu.column.key}`] ?? ""}
          types={data.types}
          menuTypes={data.menuTypes}
          halfDays={data.settings.halfDays}
          auTracking={data.settings.auTracking}
          actions={menuActions}
        />
      )}

      {count && <CountPopover count={count} year={y} onClose={() => setCount(null)} />}

      <p
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-on-ink shadow-lg ${
          toast ? "" : "sr-only"
        }`}
      >
        {toast}
      </p>
    </div>
  );
}

function CountPopover({
  count,
  year,
  onClose,
}: {
  count: CountState;
  year: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const title = count.kind === "sick" ? `Krankheitstage ${year}` : `Urlaub genommen ${year}`;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${count.person.name}: ${title}`}
      style={{ left: Math.min(count.x, innerWidth - 332), top: count.y }}
      className="fixed z-50 w-[min(320px,calc(100vw-24px))] rounded-xl border border-rule bg-sheet p-3 shadow-[0_12px_32px_rgba(29,43,52,0.32)]"
    >
      <h3 className="text-sm font-bold">
        {count.person.name}: {title}
      </h3>
      <p className="mt-1 text-[13px] text-ink-2">{count.text ?? "Laden …"}</p>
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
      <span>Klick: frei, X, U, frei. Rechtsklick oder Kontextmenü-Taste: weitere Arten.</span>
    </div>
  );
}
