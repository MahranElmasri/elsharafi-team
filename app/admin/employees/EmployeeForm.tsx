"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/actions/employees";
import { FormMessage } from "@/components/FormMessage";
import { FULL_TIME_DAYS, suggestedAllowance, WEEKDAYS } from "@/lib/employees";
import { labels } from "@/lib/labels";

const L = labels.employees;

export interface EmployeeValues {
  fullName: string;
  username: string;
  email: string;
  team: string;
  role: "admin" | "employee";
  workdays: number[];
  startDate: string;
  endDate: string;
}

export function EmployeeForm({
  action,
  teams,
  initial,
  submitLabel,
  pendingLabel,
  suggestionYear,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  teams: { id: string; name: string }[];
  initial: EmployeeValues;
  submitLabel: string;
  pendingLabel: string;
  /** Profile only (R13): show the §5 BUrlG allowance for this year live under the workdays. */
  suggestionYear?: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const saved = {
    workdays: initial.workdays.length,
    start: initial.startDate,
    end: initial.endDate,
  };
  const [plan, setPlan] = useState(saved);
  const suggestion =
    suggestionYear !== undefined && plan.workdays > 0 && plan.start
      ? suggestedAllowance(plan.workdays, plan.start, plan.end || null, suggestionYear)
      : null;

  return (
    <form
      action={formAction}
      onChange={(e) => {
        if (suggestionYear === undefined) return;
        const f = new FormData(e.currentTarget);
        setPlan({
          workdays: f.getAll("workdays").length,
          start: String(f.get("startDate") ?? ""),
          end: String(f.get("endDate") ?? ""),
        });
      }}
      // React resets the fields to `initial` after the action; follow suit.
      onReset={() => setPlan(saved)}
      className="grid gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={L.fullName}>
          <input name="fullName" defaultValue={initial.fullName} required className="field" />
        </Field>
        <Field label={L.username} hint={L.usernameHint}>
          <input
            name="username"
            defaultValue={initial.username}
            required
            autoCapitalize="none"
            spellCheck={false}
            className="field"
          />
        </Field>
        <Field label={L.email} hint={L.emailHint}>
          <input name="email" type="email" defaultValue={initial.email} className="field" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={L.team}>
            <select name="team" defaultValue={initial.team} className="field">
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L.role}>
            <select name="role" defaultValue={initial.role} className="field">
              <option value="employee">{labels.roles.employee}</option>
              <option value="admin">{labels.roles.admin}</option>
            </select>
          </Field>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-bold">{L.workdays}</legend>
        <div className="flex gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d.n} className="cursor-pointer">
              <input
                type="checkbox"
                name="workdays"
                value={d.n}
                defaultChecked={initial.workdays.includes(d.n)}
                className="peer sr-only"
              />
              <span className="grid size-11 place-items-center rounded-full border-2 border-pencil font-bold text-pencil peer-checked:border-ink peer-checked:bg-ink peer-checked:text-on-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-urlaub">
                {d.short}
              </span>
            </label>
          ))}
        </div>
        {suggestionYear !== undefined && (
          <p aria-live="polite" className="text-sm text-pencil">
            {suggestion !== null &&
              L.liveSuggestion(suggestionYear, suggestion.toLocaleString("de-DE"), FULL_TIME_DAYS)}
          </p>
        )}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={L.startDate}>
          <input
            name="startDate"
            type="date"
            defaultValue={initial.startDate}
            required
            className="field"
          />
        </Field>
        <Field label={L.endDate}>
          <input name="endDate" type="date" defaultValue={initial.endDate} className="field" />
        </Field>
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="btn-ink justify-self-start">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="text-sm text-pencil">{hint}</span>}
    </label>
  );
}
