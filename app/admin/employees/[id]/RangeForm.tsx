"use client";

import { useActionState, useState } from "react";
import { rangeEntry, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";

/** Enter or remove one type for a whole period, e.g. Elternzeit (R26). */
export function RangeForm({
  id,
  today,
  types,
}: {
  id: string;
  today: string;
  types: { code: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    rangeEntry.bind(null, id),
    {},
  );
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const label = "grid min-w-0 gap-1 text-sm font-medium";
  return (
    <form action={action} className="grid gap-4">
      <label className={label}>
        Art
        <select name="type" className="field" defaultValue="parental">
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
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
      <p className="text-[13px] text-ink-2">
        Nur an den Arbeitstagen dieser Person, ohne Feiertage. Schon belegte Tage bleiben, wie sie
        sind. „Entfernen“ löscht alle Tage dieser Art im Zeitraum, außer Tagen aus Anträgen.
      </p>
      <div className="flex flex-wrap gap-4">
        <button type="submit" name="intent" value="set" disabled={pending} className="btn-ink">
          Eintragen
        </button>
        <button
          type="submit"
          name="intent"
          value="remove"
          disabled={pending}
          className="btn-plain"
          onClick={(e) => {
            if (!confirm("Alle Tage dieser Art im Zeitraum entfernen?")) e.preventDefault();
          }}
        >
          Entfernen
        </button>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      {state.warning && (
        <p role="alert" className="border-l-4 border-[var(--note)] pl-3 text-sm">
          {state.warning}
        </p>
      )}
    </form>
  );
}
