"use client";

import { useActionState } from "react";
import { setPassword, type FormState } from "@/app/actions/invites";
import { labels } from "@/lib/labels";
import { PasswordInput } from "@/components/PasswordInput";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPassword.bind(null, token),
    {},
  );

  return (
    <form action={action} className="grid gap-5" noValidate>
      <PasswordInput
        label={labels.invite.password}
        name="password"
        autoComplete="new-password"
        minLength={6}
      />
      <PasswordInput
        label={labels.invite.repeat}
        name="repeat"
        autoComplete="new-password"
        minLength={6}
      />
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
