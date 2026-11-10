"use client";

import { useActionState, useState, useTransition } from "react";
import { saveAllowance, suggestAllowance } from "@/app/actions/employees";
import { FormMessage } from "@/components/FormMessage";
import { labels } from "@/lib/labels";

const L = labels.employees;
const fmt = (n: number) => n.toLocaleString("de-DE");

export function AllowanceForm({
  id,
  year,
  days,
  carryover,
}: {
  id: string;
  year: number;
  days: number | null;
  carryover: number;
}) {
  const [state, action, pending] = useActionState(saveAllowance.bind(null, id, year), {});
  const [daysValue, setDaysValue] = useState(days === null ? "" : fmt(days));
  const [fullTime, setFullTime] = useState("30");
  const [suggestion, setSuggestion] = useState<{ days?: number; error?: string }>({});
  const [suggesting, startSuggest] = useTransition();

  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4">
        <div className="flex flex-wrap gap-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-bold">{L.allowanceDays}</span>
            <input
              name="days"
              inputMode="decimal"
              value={daysValue}
              onChange={(e) => setDaysValue(e.target.value)}
              required
              className="field w-28"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-bold">{L.carryover}</span>
            <input
              name="carryover"
              inputMode="decimal"
              defaultValue={fmt(carryover)}
              className="field w-28"
            />
          </label>
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <button type="submit" disabled={pending} className="btn-ink justify-self-start">
          {L.saveAllowance}
        </button>
      </form>

      <div className="grid gap-3 border-l-4 border-rule pl-4">
        <p className="text-sm font-bold">{L.suggestion}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm">{L.fullTime}</span>
            <input
              inputMode="decimal"
              value={fullTime}
              onChange={(e) => setFullTime(e.target.value)}
              className="field w-24"
            />
          </label>
          <button
            type="button"
            className="btn-plain pb-3"
            disabled={suggesting}
            onClick={() =>
              startSuggest(async () =>
                setSuggestion(await suggestAllowance(id, year, Number(fullTime.replace(",", ".")))),
              )
            }
          >
            {L.suggest}
          </button>
        </div>
        {suggestion.error && <FormMessage error={suggestion.error} />}
        {suggestion.days !== undefined && (
          <p className="flex flex-wrap items-center gap-3">
            <span>{L.suggested(fmt(suggestion.days))}</span>
            <button
              type="button"
              className="btn-plain"
              onClick={() => setDaysValue(fmt(suggestion.days!))}
            >
              {L.take}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
