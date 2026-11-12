# Tasks
Each task gets tests first and is ticked off when done. Each one touches at most ~5 files. `Req` points to the requirements it covers.

## Phase A — Foundation
- [x] **T0 Scaffold**
  - Work: `create-next-app` (TS, Tailwind, App Router, ESLint); add Prettier, Vitest, Playwright; `supabase init`; npm scripts.
  - Verify: `npm run build && npm run lint && npm test`
- [x] **T1 Core schema** (Req R1, R3, R19, R24, R25)
  - Work: `teams`, `absence_types` (with the fixed-type trigger and the 15 seeded types), `app_settings`, `profiles` + trigger, `is_admin`, base RLS, seed.
  - Verify: `npx supabase test db` (RLS: employee reads only their own profile)
- [x] **T2 Calendar** (Req R5, R6)
  - Work: `berlin_holidays`, `person_workdays`.
  - Verify: pgTAP: 2026 dates; a Mon/Tue/Thu part-timer's 6.–10.4.2026 counts 2 days

## Phase B — Rules in the database
- [x] **T3 Absence days** (Req R2, R4, R20)
  - Work: `absence_days` + workday trigger, `set_absence`, `day_notes` / `set_note`, `audit_log` triggers.
  - Verify: pgTAP: X on a Saturday fails, a second entry on the same day fails, the audit row is written
- [x] **T4 Balances** (Req R12, R13, R14)
  - Work: `leave_allowances`, `balances`, `suggested_allowance`.
  - Verify: pgTAP: a joiner on 1.7. with 3 workdays gets 9 days; carry-over 5, 3 days used in March, 2 expired on 1.4.
- [x] **T5 Requests** (Req R7, R8, R9, R18)
  - Work: `leave_requests`, `request_leave`, `report_absence`, `decide_leave`, `cancel_leave`, `notifications` rows + email payload.
  - Verify: pgTAP: over-balance rejected, overlap rejected, approve re-checks the balance, employee can't decide
- [x] **T6 Conflicts & team view** (Req R10, R11)
  - Work: `team_day_load`, `request_conflicts`, `team_calendar`.
  - Verify: pgTAP: same team flagged, other team not; the type is never returned
- [x] **T7 Closures & AU** (Req R16, R17)
  - Work: `closure_days`, `set_closure`, `set_au`, `missing_au`.
  - Verify: pgTAP: closure is safe to repeat, conflicts are listed; a 4-day run without AU is listed
- [x] **T7b Settings, types & range entry in SQL** (Req R24, R25, R26)
  - Work: switch checks inside the functions from T3–T7, `save_absence_type`, `delete_absence_type`, `type_usage`, `set_absence_range`, `clear_absence_range`.
  - Verify: pgTAP: each switch off → its function rejects or returns nothing, and on again → the old data is back. A hidden type is rejected but old entries still count. A fixed type can't be hidden. A type in use can't be deleted. Bildungsurlaub over 10 days in 2 years produces a warning. A range entry skips non-working and already-taken days.
- [x] **T8 Retention & cron** (Req R15, R20)
  - Work: `reminder_log`, purge function, `pg_cron` jobs, `pg_net` call.
  - Verify: pgTAP: the purge removes 2022 sick days and keeps vacation

## Phase C — App
- [x] **T9 Auth shell** (Req R1)
  - Work: `lib/supabase/*`, `middleware.ts`, `/login` (username → Auth-email lookup, one generic error), layout, `scripts/create-admin.mjs`. The script sets the first admin's password directly; this is the bootstrap only, before any admin exists to send invites.
  - Verify: e2e: log in and out; a deactivated user is blocked
- [x] **T9b Invites & reset** (Req R23)
  - Work: `invite_tokens` migration, `lib/invites.ts`, `/einladung/[token]`, `/passwort-vergessen`.
  - Verify: Vitest for hash and expiry. e2e: create invite → open → set password → logged in. Opening a used link again is refused, and so is an expired link (adjust the clock with SQL). "Passwort vergessen" with an unknown username shows the same message.
- [x] **T10 Employee management** (Req R19, R13)
  - Work: `/admin/employees` + admin actions (create, ban, delete, "Einladung erstellen" with link + QR + email), the allowance suggestion, team limits.
  - Verify: e2e: add an employee; deleting someone with entries is refused
- [x] **T10b Invite email with steps and QR** (Req R23)
  - Work: `inviteMail()` in `lib/invites.ts` (text + HTML, inline QR PNG); `Mail` gets `html`/`attachments`; `createInviteFor` uses it.
  - Verify: Vitest: username, steps, link, expiry and the QR attachment are in the mail, and names are escaped; one real send to an own address.
- [x] **T11 Grid view** (Req R2)
  - Work: `AttendanceGrid` (read only): month, search, tabs, counts, lines, holidays, today, hatching.
  - Verify: Vitest for the column builder; manual check with 45 rows
- [x] **T12 Grid editing** (Req R2, R4, R17)
  - Work: click cycle (optimistic), right-click menu, notes, AU, count popover.
  - Verify: Vitest for the cycle; e2e for a grid click
- [x] **T13 Employee page** (Req R7, R8, R11, R12)
  - Work: `PersonView`, `YearCalendar`, `RequestList`, `/me` forms, Team tab.
  - Verify: e2e: request + sick report; works at 375 px
- [x] **T14 Approvals panel** (Req R9, R10, R17)
  - Work: `PendingRequests`, `MissingAu`, `/admin/employees/[id]`.
  - Verify: e2e: ⚠ conflict shown → approve
- [x] **T15 Notifications** (Req R18)
  - Work: `NotificationBell` (Realtime), `lib/mail.ts`, wire up the actions.
  - Verify: Vitest for templates; e2e: the bell updates live
- [x] **T16 Reminders endpoint** (Req R15)
  - Work: `api/cron/reminders` with a `CRON_SECRET` check: calls `run_reminders`, sends the emails, then `log_reminder_email` for each one sent.
  - Verify: `curl` with the secret writes `reminder_log`; a wrong secret gets 401
- [x] **T17 Closures & audit pages** (Req R16, R20)
  - Work: `/admin/closures`, `/admin/audit`.
  - Verify: manual and e2e for a closure
- [x] **T17b Settings page** (Req R24, R25, R26)
  - Work: `/admin/settings` (4 switches + absence-type table with add, edit and show/hide), `lib/settings.ts`, hide the switched-off parts in the grid, `/me` and the request forms, the range-entry form on `/admin/employees/[id]`.
  - Verify: e2e: switching off half days removes the ½ option everywhere; switching off the team calendar removes the Team tab; hiding a type removes it from the menu while old cells still show it; Elternzeit entered for 3 months shows in the grid.
- [x] **T15c PWA & push** (Req R27)
  - Work: migration (`push_subscriptions`, save/delete RPCs, `call_app_endpoint`, notifications trigger); `app/manifest.ts`, `app/apple-icon.png`, 192 px icon; `public/sw.js`; `PushToggle` in the Meldungen panel; `lib/push.ts` + `app/api/push`; middleware paths; `web-push@3.6.7`; local VAPID keys in `.env.local` and local Vault `app_url` = `http://host.docker.internal:3000`; logout first removes this device's push.
  - Verify: pgTAP: RLS and RPCs, the trigger queues one request only when a recipient has a subscription and Vault is set; Vitest: payload and 404/410 cleanup; e2e: manifest served, `sw.js` registered, toggle shown; the real phone check (needs HTTPS) moves to T20
- [x] **T17d App icon**
  - Work: `app/favicon.ico` and `app/icon.png` from the calendar artwork.
  - Verify: the tab shows the calendar; `/favicon.ico` and the icon link load
- [x] **T17c Type show/hide switch** (Req R25)
  - Work: shared `Switch` component; `setTypeVisible` action; a switch on each non-fixed row of Abwesenheitsarten; the form keeps "Sichtbar" for new types only.
  - Verify: e2e: switching off Sonderurlaub Umzug removes it from the grid menu and the request form; switching on brings it back; fixed types have no switch
- [x] **T15b Live page update** (Req R18)
  - Work: the bell calls `router.refresh()` on each Realtime INSERT.
  - Verify: e2e: a request shows in the admin's open grid and "Offene Anträge" with no reload; an approval shows on the employee's open `/me` with no reload
- [x] **T18 Export & backup** (Req R21)
  - Work: the xlsx and json routes.
  - Verify: e2e download; the file opens and matches the grid

## Phase D — Go-live
- [ ] **T19 Import** (Req R22)
  - Blocked by Open Question 1.
  - Work: the parser and script.
  - Verify: Vitest for the parser; `--dry-run` totals match
- [ ] **T20 Release** (ask first)
  - Work: `db push` to production, deploy, set the Vault secrets `app_url` and `cron_secret`, the VAPID keys (`npx web-push generate-vapid-keys`) and `VAPID_SUBJECT`, create the admin, real import, full e2e against staging, and a real Android and iPhone (added to the home screen) get a push with the app closed (R27).
  - Verify: every success criterion in `requirements.md` §3
