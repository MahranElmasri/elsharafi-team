import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { labels } from "@/lib/labels";
import { loadNotices } from "@/lib/notifications";
import type { CurrentUser } from "@/lib/session";

export async function AppHeader({ user }: { user: CurrentUser }) {
  const notices = await loadNotices();
  return (
    <header className="border-b border-rule bg-sheet print:hidden">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="font-extrabold tracking-tight">
            {labels.appName} <span className="font-normal text-pencil">{labels.practice}</span>
          </p>
          {user.role === "admin" && (
            <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Bereiche">
              <Link href="/admin" className="btn-plain">
                {labels.nav.overview}
              </Link>
              <Link href="/admin/employees" className="btn-plain">
                {labels.nav.employees}
              </Link>
              <Link href="/admin/closures" className="btn-plain">
                {labels.nav.closures}
              </Link>
              <Link href="/admin/audit" className="btn-plain">
                {labels.nav.audit}
              </Link>
              <Link href="/admin/settings" className="btn-plain">
                {labels.nav.settings}
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell userId={user.id} initial={notices} />
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
