"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markNoticesRead } from "@/app/actions/notifications";
import { PushToggle } from "@/components/PushToggle";
import { toNotice, type Notice } from "@/lib/notice";
import { registerServiceWorker } from "@/lib/push-client";
import { createBrowserClient } from "@/lib/supabase/browser";

const when = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Meldungen": the latest notifications, updated live through Realtime; each one also refreshes the page (R18). */
export function NotificationBell({
  userId,
  initial,
}: {
  userId: string;
  initial: { notices: Notice[]; unread: number };
}) {
  const [notices, setNotices] = useState(initial.notices);
  const [unread, setUnread] = useState(initial.unread);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // A page load brings the server's list.
  useEffect(() => {
    setNotices(initial.notices);
    setUnread(initial.unread);
  }, [initial]);

  useEffect(registerServiceWorker, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const notice = toNotice(payload.new as Parameters<typeof toNotice>[0]);
            setNotices((list) => [notice, ...list.filter((n) => n.id !== notice.id)].slice(0, 20));
            setUnread((n) => n + 1);
            setAnnounce(`Neue Meldung: ${notice.message}`);
            // Reload the open page's server data so the grid and calendars show the change (R18).
            router.refresh();
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void markNoticesRead();
    }
    if (!next) setNotices((list) => list.map((n) => ({ ...n, read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="notices"
        aria-label={unread ? `Meldungen, ${unread} neu` : "Meldungen"}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ink-2 hover:text-ink"
      >
        Meldungen
        <span
          aria-hidden
          className={`inline-grid min-w-6 place-items-center rounded-full px-1.5 text-sm font-bold ${
            unread ? "bg-krank text-on-ink" : "bg-[var(--hatch)] text-ink-2"
          }`}
        >
          {unread}
        </span>
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {open && (
        <div
          id="notices"
          className="fixed inset-x-3 top-24 z-50 rounded-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[360px] border border-rule bg-sheet p-2 shadow-[0_12px_32px_rgba(29,43,52,0.32)]"
        >
          <h2 className="px-2 pt-1.5 pb-1 text-sm font-bold">Meldungen</h2>
          <PushToggle />
          {notices.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-ink-2">
              Noch keine Meldungen. Hier erscheinen Anträge, Entscheidungen und Erinnerungen.
            </p>
          ) : (
            <ul className="grid max-h-[60vh] overflow-auto" aria-label="Letzte Meldungen">
              {notices.map((n) => {
                const body = (
                  <>
                    <span className={n.read ? "" : "font-bold"}>{n.message}</span>
                    <span className="block text-xs text-ink-2">
                      {when.format(new Date(n.createdAt))}
                      {!n.read && " · neu"}
                    </span>
                  </>
                );
                const cls = "block rounded-lg px-2 py-2 text-sm hover:bg-[var(--hatch)]";
                return (
                  <li key={n.id} className="border-t border-rule first:border-t-0">
                    {n.link?.startsWith("/") ? (
                      <Link href={n.link} className={cls} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
