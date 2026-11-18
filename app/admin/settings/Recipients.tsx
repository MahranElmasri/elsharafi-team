"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addRecipient, removeRecipient, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";

/** "E-Mail-Empfänger": extra addresses for request and sick-report emails (R18). */
export function Recipients({ emails }: { emails: string[] }) {
  const [added, action, pending] = useActionState(addRecipient, {});
  // The last action's answer, whether it was adding or removing.
  const [message, setMessage] = useState<FormState>({});
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setMessage(added);
    if (added.done) form.current?.reset();
  }, [added]);

  return (
    <div className="grid gap-3">
      {emails.length > 0 ? (
        <ul className="grid gap-2" aria-label="E-Mail-Empfänger">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-sheet p-3"
            >
              <span className="min-w-0 break-all">{email}</span>
              <button
                type="button"
                className="text-sm underline"
                disabled={busy}
                aria-label={`${email} entfernen`}
                onClick={() => start(async () => setMessage(await removeRecipient(email)))}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">Noch keine weiteren Empfänger.</p>
      )}
      <form ref={form} action={action} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
          E-Mail-Adresse
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            className="field"
            placeholder="praxis@beispiel.de"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-[10px] bg-ink px-3.5 py-2.5 font-bold text-on-ink"
        >
          Hinzufügen
        </button>
      </form>
      <FormMessage error={message.error} ok={message.ok} />
    </div>
  );
}
