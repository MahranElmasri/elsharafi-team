"use client";

import { useState, useTransition } from "react";
import { removeClosure } from "@/app/actions/closures";
import { FormMessage } from "@/components/FormMessage";

export function RemoveClosure({ from, to, label }: { from: string; to: string; label: string }) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  return (
    <div className="grid justify-items-end gap-1">
      <button
        type="button"
        disabled={busy}
        className="btn-plain"
        onClick={() => {
          if (
            !confirm(
              `Schließung ${label} entfernen? Die Betriebsurlaubstage aller Mitarbeitenden werden gelöscht.`,
            )
          )
            return;
          start(async () => setMessage(await removeClosure(from, to)));
        }}
      >
        Entfernen
      </button>
      <FormMessage {...message} />
    </div>
  );
}
