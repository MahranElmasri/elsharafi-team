"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stamp } from "@/components/Stamp";
import type { GridEntry, GridType } from "@/components/AttendanceGrid";

export interface MenuActions {
  chooseType: (type: string) => void;
  setHalf: (half: "am" | "pm" | null) => void;
  setAu: (received: boolean) => void;
  remove: () => void;
  saveNote: (note: string) => void;
  close: () => void;
}

/** The cell's context menu (R2): every visible type, half day, "AU liegt vor", note. */
export function GridMenu({
  title,
  at,
  entry,
  note,
  types,
  menuTypes,
  halfDays,
  auTracking,
  actions,
}: {
  title: string;
  at: { x: number; y: number };
  entry?: GridEntry;
  note: string;
  types: Record<string, GridType>;
  menuTypes: string[];
  halfDays: boolean;
  auTracking: boolean;
  actions: MenuActions;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [noteText, setNoteText] = useState(note);
  const pending = entry?.status === "pending";
  const isSick = entry && (entry.type === "sick" || entry.type === "child_sick");

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = at.x;
    let y = at.y;
    if (x + w > innerWidth - 12) x = innerWidth - w - 12;
    if (y + h > innerHeight - 12) y = Math.max(12, innerHeight - h - 12);
    setPos({ x: Math.max(12, x), y });
  }, [at]);

  // The handlers change on every render of the grid; the listener always calls the latest.
  const close = useRef(actions.close);
  useEffect(() => {
    close.current = actions.close;
  });

  // On open only: focus the current choice and close on a click outside.
  useEffect(() => {
    const el = ref.current;
    (
      el?.querySelector<HTMLElement>('[aria-checked="true"]') ?? el?.querySelector("button")
    )?.focus();
    const outside = (e: PointerEvent) => {
      if (!el?.contains(e.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      actions.close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[data-mi]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
    e.preventDefault();
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left hover:bg-[var(--hatch)] focus-visible:bg-[var(--hatch)]";
  const group = "mt-1.5 border-t border-rule pt-1.5";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      onKeyDown={onKeyDown}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 w-[min(320px,calc(100vw-24px))] rounded-xl border border-rule bg-sheet p-2 shadow-[0_12px_32px_rgba(29,43,52,0.32)]"
    >
      <h3 className="px-2 pt-1.5 pb-1 text-sm font-bold">{title}</h3>

      {pending ? (
        <p className="mx-2 mb-2 text-[13px] text-ink-2">
          Beantragt. Entscheiden Sie im Antrag unter „Offene Anträge“.
        </p>
      ) : (
        <>
          <div className="max-h-[260px] overflow-auto">
            {menuTypes.map((code) => {
              const t = types[code];
              return (
                <button
                  key={code}
                  data-mi
                  role="menuitemradio"
                  aria-checked={entry?.type === code}
                  className={item}
                  onClick={() => actions.chooseType(code)}
                >
                  <span className="scale-[0.8]">
                    <Stamp letter={t.letter} color={t.color} />
                  </span>
                  {t.label}
                  {entry?.type === code && <Check />}
                </button>
              );
            })}
          </div>

          {entry && halfDays && (
            <div className={group}>
              {(
                [
                  [null, "Ganzer Tag"],
                  ["am", "Halber Tag, vormittags"],
                  ["pm", "Halber Tag, nachmittags"],
                ] as const
              ).map(([half, label]) => (
                <button
                  key={label}
                  data-mi
                  role="menuitemradio"
                  aria-checked={(entry.half ?? null) === half}
                  className={item}
                  onClick={() => actions.setHalf(half)}
                >
                  {label}
                  {(entry.half ?? null) === half && <Check />}
                </button>
              ))}
            </div>
          )}

          {isSick && auTracking && (
            <div className={group}>
              <button
                data-mi
                role="menuitemcheckbox"
                aria-checked={entry.auReceived}
                className={item}
                onClick={() => actions.setAu(!entry.auReceived)}
              >
                AU liegt vor
                {entry.auReceived && <Check />}
              </button>
            </div>
          )}

          {entry && (
            <div className={group}>
              <button data-mi role="menuitem" className={item} onClick={actions.remove}>
                Eintrag entfernen
              </button>
            </div>
          )}
        </>
      )}

      <form
        className={`${group} grid gap-1.5 px-2 pb-1`}
        onSubmit={(e) => {
          e.preventDefault();
          actions.saveNote(noteText.trim());
        }}
      >
        <label htmlFor="grid-note" className="text-[13px] text-ink-2">
          Notiz zu diesem Tag
        </label>
        <textarea
          id="grid-note"
          value={noteText}
          maxLength={500}
          onChange={(e) => setNoteText(e.target.value)}
          className="min-h-14 w-full rounded-lg border border-rule bg-paper px-2 py-1.5"
        />
        <button data-mi type="submit" className="btn-plain justify-self-start">
          Notiz speichern
        </button>
      </form>
    </div>
  );
}

/** Visual tick only; screen readers get aria-checked. */
function Check() {
  return (
    <span aria-hidden className="ml-auto font-extrabold">
      ✓
    </span>
  );
}
