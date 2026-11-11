"use client";

import { useActionState, useState } from "react";
import { createClosure, type ClosureState } from "@/app/actions/closures";
import { FormMessage } from "@/components/FormMessage";
import { groupDays } from "@/lib/grid";

export function ClosureForm({ today, types }: { today: string; types: Record<string, string> }) {
  const [state, action, pending] = useActionState<ClosureState, FormData>(createClosure, {});
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState(""); // kept after submit, so a repeat keeps the note
  const label = "grid min-w-0 gap-1 text-sm font-medium";
  return (
    <form action={action} className="grid max-w-xl gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Von
          <input
            name="from"
            type="date"
            className="field w-full min-w-0"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to < e.target.value) setTo(e.target.value);
            }}
          />
        </label>
        <label className={label}>
          Bis
          <input
            name="to"
            type="date"
            min={from}
            className="field w-full min-w-0"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <label className={label}>
        Notiz (freiwillig)
        <input
          name="note"
          maxLength={200}
          placeholder="z. B. Weihnachten"
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-[13px] text-ink-2">
        Alle aktiven Mitarbeitenden bekommen an ihren Arbeitstagen Betriebsurlaub (B). Feiertage
        zählen nicht. Tage mit anderen Einträgen bleiben unverändert und werden unten aufgelistet.
      </p>
      <button type="submit" disabled={pending} className="btn-ink justify-self-start">
        {pending ? "Eintragen …" : "Schließung eintragen"}
      </button>
      <FormMessage error={state.error} ok={state.ok} />
      {state.skipped && state.skipped.length > 0 && (
        <div className="grid gap-1.5 text-sm">
          <p className="font-bold">Übersprungen, weil schon etwas eingetragen ist:</p>
          <ul className="grid gap-1" aria-label="Übersprungene Tage">
            {state.skipped.map((s) => (
              <li key={`${s.name}|${s.type}`}>
                {s.name}: {types[s.type] ?? s.type} {groupDays(s.days)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
