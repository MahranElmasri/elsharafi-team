"use client";

import { useState, useTransition } from "react";
import { deleteEmployee, setEmployeeActive, type ActionState } from "@/app/actions/employees";
import { FormMessage } from "@/components/FormMessage";
import { labels } from "@/lib/labels";

const L = labels.employees;

export function AccountPanel({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4">
      <p className="text-sm text-pencil">{L.deactivateHint}</p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={pending}
          className="btn-ink"
          onClick={() => start(async () => setState(await setEmployeeActive(id, !active)))}
        >
          {active ? L.deactivate : L.activate}
        </button>
        <button
          type="button"
          disabled={pending}
          className="btn-plain text-krank"
          onClick={() => {
            if (!window.confirm(L.removeConfirm(name))) return;
            start(async () => setState(await deleteEmployee(id)));
          }}
        >
          {L.remove}
        </button>
      </div>
      <p className="text-sm text-pencil">{L.removeHint}</p>
      <FormMessage error={state.error} ok={state.ok} />
    </div>
  );
}
