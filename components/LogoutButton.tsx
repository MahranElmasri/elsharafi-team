"use client";

import { logout } from "@/app/actions/auth";
import { labels } from "@/lib/labels";
import { turnPushOff } from "@/lib/push-client";

/** Logout that first stops push to this device, so a shared phone shows no one else's news. */
export function LogoutButton() {
  return (
    <form
      action={async () => {
        await turnPushOff().catch(() => undefined);
        await logout();
      }}
    >
      <button type="submit" className="btn-plain">
        {labels.logout}
      </button>
    </form>
  );
}
