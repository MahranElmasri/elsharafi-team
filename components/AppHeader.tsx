import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { labels } from "@/lib/labels";
import type { CurrentUser } from "@/lib/session";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-rule bg-sheet print:hidden">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="font-extrabold tracking-tight">
            {labels.appName} <span className="font-normal text-pencil">{labels.practice}</span>
          </p>
          {user.role === "admin" && (
            <nav className="flex gap-4" aria-label="Bereiche">
              <Link href="/admin" className="btn-plain">
                {labels.nav.overview}
              </Link>
              <Link href="/admin/employees" className="btn-plain">
                {labels.nav.employees}
              </Link>
            </nav>
          )}
        </div>
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
