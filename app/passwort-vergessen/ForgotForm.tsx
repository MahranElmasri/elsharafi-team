"use client";

import { useActionState } from "react";
import { requestReset, type FormState } from "@/app/actions/invites";
import { labels } from "@/lib/labels";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestReset, {});

  if (state.done) {
    return (
      <p role="status" className="border-l-4 border-urlaub pl-3">
        {labels.forgot.done}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      <p className="text-ink-2">{labels.forgot.intro}</p>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold">{labels.forgot.username}</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="field"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-ink">
        {pending ? labels.forgot.pending : labels.forgot.submit}
      </button>
    </form>
  );
}
