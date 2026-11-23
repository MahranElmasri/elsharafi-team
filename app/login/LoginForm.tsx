"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { labels } from "@/lib/labels";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const message = state.error ?? notice;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <label className="grid gap-1.5">
        <span className="text-sm font-bold">{labels.login.username}</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="field"
        />
      </label>
      <PasswordInput
        label={labels.login.password}
        name="password"
        autoComplete="current-password"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked />
        {labels.login.remember}
      </label>
      {message && (
        <p role="alert" className="border-l-4 border-krank pl-3 text-sm text-krank">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-ink">
        {pending ? labels.login.pending : labels.login.submit}
      </button>
    </form>
  );
}
