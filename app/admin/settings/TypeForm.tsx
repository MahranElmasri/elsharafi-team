"use client";

import { useActionState, useTransition, useState } from "react";
import { deleteType, saveType, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";
import { TYPE_COLORS } from "@/lib/settings";

export interface TypeRow {
  code: string;
  letter: string;
  label: string;
  color: string;
  entry_mode: "request" | "report" | "admin";
  deducts_vacation: boolean;
  is_health: boolean;
  limit_days: number | null;
  limit_years: number | null;
  visible: boolean;
  is_fixed: boolean;
  sort: number;
}

const MODES = [
  ["request", "Mitarbeitende beantragen (Genehmigung nötig)"],
  ["report", "Mitarbeitende melden (sofort eingetragen)"],
  ["admin", "Nur die Praxisleitung"],
] as const;

/** Edit one absence type, or add a new one when `type` is missing (R25). */
export function TypeForm({ type }: { type?: TypeRow }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveType, {});
  const fixed = type?.is_fixed ?? false;
  const label = "grid min-w-0 gap-1 text-sm font-medium";
  const check = "flex items-center gap-2 text-sm";
  return (
    <form action={action} className="grid gap-4" key={state.done}>
      <input type="hidden" name="code" value={type?.code ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_10rem]">
        <label className={label}>
          Bezeichnung
          <input
            name="label"
            required
            maxLength={60}
            defaultValue={type?.label}
            className="field"
          />
        </label>
        <label className={label}>
          Zeichen
          <input
            name="letter"
            required
            maxLength={2}
            defaultValue={type?.letter}
            className="field uppercase"
          />
        </label>
        <label className={label}>
          Farbe
          <select name="color" defaultValue={type?.color ?? "--slate"} className="field">
            {TYPE_COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fixed ? (
        <>
          {/* The database refuses rule changes on fixed types, so the current rules go back unchanged. */}
          <input type="hidden" name="entry_mode" value={type!.entry_mode} />
          {type!.deducts_vacation && <input type="hidden" name="deducts_vacation" value="on" />}
          {type!.is_health && <input type="hidden" name="is_health" value="on" />}
          <p className="text-[13px] text-ink-2">
            Feste Art: Regeln und Sichtbarkeit bleiben, weil Klick-Folge, Urlaubskonto und
            Schließungen davon abhängen.
          </p>
        </>
      ) : (
        <>
          <label className={label}>
            Eingetragen von
            <select
              name="entry_mode"
              defaultValue={type?.entry_mode ?? "request"}
              className="field"
            >
              {MODES.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {!type && (
              <label className={check}>
                <input type="checkbox" name="visible" defaultChecked />
                Sichtbar
              </label>
            )}
            <label className={check}>
              <input
                type="checkbox"
                name="deducts_vacation"
                defaultChecked={type?.deducts_vacation}
              />
              Zieht Urlaub ab
            </label>
            <label className={check}>
              <input type="checkbox" name="is_health" defaultChecked={type?.is_health} />
              Gesundheitsdaten (nur Praxisleitung, Löschung nach 3 Jahren)
            </label>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Grenze (freiwillig, nur Warnung)</legend>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              höchstens
              <input
                name="limit_days"
                inputMode="decimal"
                aria-label="Grenze in Tagen"
                defaultValue={type?.limit_days ?? ""}
                className="field w-20"
              />
              Tage in
              <select
                name="limit_years"
                aria-label="Zeitraum der Grenze"
                defaultValue={type?.limit_years ?? ""}
                className="field"
              >
                <option value="">–</option>
                <option value="1">1 Kalenderjahr</option>
                <option value="2">2 Kalenderjahren</option>
              </select>
            </div>
          </fieldset>
        </>
      )}

      <label className={`${label} w-28`}>
        Reihenfolge
        <input
          name="sort"
          type="number"
          min={0}
          max={999}
          defaultValue={type?.sort ?? 100}
          className="field"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-ink">
          {pending ? "Speichern …" : type ? "Speichern" : "Art hinzufügen"}
        </button>
        {type && !fixed && <DeleteType code={type.code} label={type.label} />}
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

function DeleteType({ code, label }: { code: string; label: string }) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<FormState>({});
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="btn-plain"
        onClick={() => {
          if (
            !confirm(`„${label}“ löschen? Das geht nur, wenn die Art noch nie verwendet wurde.`)
          ) {
            return;
          }
          start(async () => setMessage(await deleteType(code)));
        }}
      >
        Löschen
      </button>
      <FormMessage {...message} />
    </>
  );
}
