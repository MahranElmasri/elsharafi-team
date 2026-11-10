import { logout } from "@/app/actions/auth";
import { labels } from "@/lib/labels";
import type { CurrentUser } from "@/lib/session";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-rule bg-sheet">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3">
        <p className="font-extrabold tracking-tight">
          {labels.appName} <span className="font-normal text-pencil">{labels.practice}</span>
        </p>
        <div className="flex items-center gap-4">
          <span className="hidden text-ink-2 sm:inline">{user.fullName}</span>
          <form action={logout}>
            <button type="submit" className="btn-plain">
              {labels.logout}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
