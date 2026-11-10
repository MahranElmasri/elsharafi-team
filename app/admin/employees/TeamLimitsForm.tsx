"use client";

import { useActionState } from "react";
import { saveTeamLimits } from "@/app/actions/employees";
import { FormMessage } from "@/components/FormMessage";
import { labels } from "@/lib/labels";

const L = labels.employees;

export function TeamLimitsForm({
  teams,
}: {
  teams: { id: string; name: string; max_absent: number }[];
}) {
  const [state, action, pending] = useActionState(saveTeamLimits, {});
  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-pencil">{L.teamLimitsHint}</p>
      <div className="flex flex-wrap gap-5">
        {teams.map((t) => (
          <label key={t.id} className="grid gap-1.5">
            <span className="text-sm font-bold">{t.name}</span>
            <input
              name={t.id}
              type="number"
              min={0}
              max={50}
              defaultValue={t.max_absent}
              required
              className="field w-24"
            />
          </label>
        ))}
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="btn-ink justify-self-start">
        {L.saveLimits}
      </button>
    </form>
  );
}
