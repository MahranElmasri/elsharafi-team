"use client";

import { useActionState } from "react";
import { setPassword, type FormState } from "@/app/actions/invites";
import { labels } from "@/lib/labels";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPassword.bind(null, token),
    {},
  );

  return (
    <form action={action} className="grid gap-5" noValidate>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold">{labels.invite.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="field"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold">{labels.invite.repeat}</span>
        <input
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="field"
        />
      </label>
      {state.error && (
        <p role="alert" className="border-l-4 border-krank pl-3 text-sm text-krank">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-ink">
        {pending ? labels.invite.pending : labels.invite.submit}
      </button>
    </form>
  );
}
