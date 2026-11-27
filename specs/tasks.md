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
- [x] **T10d Guide attached to the invite email** (Req R23, v1.17)
  - Work: update `Anleitung/Anleitung-Mitarbeitende.html` to match the app (invite email with username and QR, "Angemeldet bleiben", "Passwort vergessen"); print the PDF; `inviteMail()` attaches it and names it in the steps; `outputFileTracingIncludes` in `next.config.ts`.
  - Verify: Vitest: the PDF attachment is in the mail and the text mentions it; without the file the mail still builds.
- [x] **T10e Admin guide** (v1.18; covers R2, R10, R12, R13, R17, R19, R21, R23–R26)
  - Work: `Anleitung/Anleitung-Praxisleitung.html` in the style of the employee guide, printed to PDF; screenshots taken from the local app with throwaway demo accounts and demo data (real names and addresses replaced), removed afterwards.
  - Verify: every step names a button or field that exists in the app; no real name or address in any screenshot; all slides fit 1280 × 720.
- [x] **T10c Shorter passwords** (Req R23)
  - Work: minimum 6 characters (was 10) in `SetPasswordForm`, `app/actions/invites.ts`, `lib/labels.ts`, `scripts/create-admin.mjs`; Supabase `minimum_password_length = 6`, no `password_requirements`.
  - Verify: typecheck, Vitest and Prettier pass.
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
- [x] **T17e Show password** (Req R23, v1.11)
  - Work: `components/PasswordInput.tsx`; used in `LoginForm` and `SetPasswordForm`.
  - Verify: typecheck, lint; e2e: the eye button switches the login field between `password` and `text`; existing login and invite specs pass
- [x] **T17d App icon**
  - Work: `app/favicon.ico` and `app/icon.png` from the calendar artwork.
  - Verify: the tab shows the calendar; `/favicon.ico` and the icon link load
- [x] **T17c Type show/hide switch** (Req R25)
  - Work: shared `Switch` component; `setTypeVisible` action; a switch on each non-fixed row of Abwesenheitsarten; the form keeps "Sichtbar" for new types only.
  - Verify: e2e: switching off Sonderurlaub Umzug removes it from the grid menu and the request form; switching on brings it back; fixed types have no switch
- [x] **T15d Substitute notices** (Req R7, R8, R18, v1.12)
  - Work: migration `20261117120000_substitute_notify.sql` (`request_leave` without the substitute notice; `decide_leave` and `cancel_leave` notify the substitute; `report_absence` gets `p_substitute`); `reportSick` passes it; "Vertretung (freiwillig)" in the Krank melden form.
  - Verify: pgTAP: no substitute notice on request; one on approval, none on denial; one on cancelling an approved request; sick report with substitute notifies without the type; a substitute from another team is refused; switch off → nobody notified. e2e request/sick specs pass
- [x] **T15b Live page update** (Req R18)
  - Work: the bell calls `router.refresh()` on each Realtime INSERT.
  - Verify: e2e: a request shows in the admin's open grid and "Offene Anträge" with no reload; an approval shows on the employee's open `/me` with no reload
- [x] **T18 Export & backup** (Req R21)
  - Work: the xlsx and json routes.
  - Verify: e2e download; the file opens and matches the grid

- [x] **T17f Hide admins from staff lists** (Req R2, v1.13)
  - Work: migration `20261118120000_hide_admins.sql` (`team_day_load`, `request_conflicts`, `request_over_limit`, `team_members` skip `role = 'admin'`); `lib/grid-data.ts` and `lib/export.ts` load employees only.
  - Verify: pgTAP: an admin in the caller's team is not in `team_members()` and not counted in `team_day_load`; e2e grid and export specs pass; the Admin row is gone from the grid

- [x] **T13b Team calendar dates** (Req R11, v1.14)
  - Work: a date header row in `components/me/TeamCalendar.tsx`, same columns as the rows; "Mein Kalender" tab goes back from the team view (fix in `app/me/page.tsx`).
  - Verify: e2e: the header shows the month's day numbers; Team → Mein Kalender leaves `ansicht=team`; fits at 375 px

- [x] **T17g Reception emails** (Req R18, v1.15)
  - Work: migration `20261118130000_notify_recipients.sql` (table, RLS, audit, `reception_notice`; `report_absence`, `decide_leave`, `cancel_leave` call it); actions `addRecipient`/`removeRecipient` in `app/actions/settings.ts`; section "E-Mail-Empfänger" on Einstellungen; audit and backup know the table; `appUrl()` keeps only the origin.
  - Verify: pgTAP: employees can't read or add; sick report → at once, name and dates only, no link; request, withdrawal, denial → nothing; approval → told; cancelling an approved leave → "doch in der Praxis"; invalid address refused. Vitest: `appUrl()` drops a path. e2e: add an address, see it listed, remove it

- [x] **T17h Angemeldet bleiben** (Req R1, v1.16)
  - Work: `lib/supabase/session-cookie.ts` (`sessionCookie()`, cookie name); `createServerClient` and `updateSession` use it; `login` sets or deletes `nur-sitzung`; checkbox in `LoginForm`, label in `lib/labels.ts`.
  - Verify: Vitest: `sessionCookie()` drops `maxAge`/`expires` only for a session-only login and never for a deletion. e2e: unchecked login gives auth cookies with no expiry; checked login gives a persistent one; existing auth specs pass

- [x] **T17i Reception emails for overview entries** (Req R18, v1.19)
  - Work: migration `20261124120000_reception_grid.sql`: `set_absence` (now returns jsonb `{day, emails}`), `set_absence_range` (adds `emails`) and `clear_absence_range` (now returns jsonb `{removed, emails}`) call `reception_notice` for the days actually added or removed; `setCell` and `saveRange` send the emails; the "E-Mail-Empfänger" text on Einstellungen names the overview; pgTAP `03_absences` and `08_types_ranges` adjusted to the jsonb returns.
  - Verify: pgTAP: a new grid day → "nicht in der Praxis" for that day; a type change → nothing; removing → "doch in der Praxis"; a range → one email from the first to the last day added; a range with nothing new → nothing; clearing a range → "doch"; every address gets it (two addresses)

- [x] **T17j Live allowance suggestion** (Req R13, v1.20)
  - Work: `suggestedAllowance()` in `lib/employees.ts` (same rule as SQL `suggested_allowance`); `EmployeeForm` takes `suggestionYear` and shows "Vorschlag Urlaubsanspruch {Jahr}: n Tage" under the working days, updated on every change; the profile page passes its `?jahr` year; the new-employee form shows nothing.
  - Verify: Vitest: 5→30 … 1→6 for a full year; the pgTAP cases (1.7. joiner, 3 days → 9; 31.3. leaver → 8); one decimal below .5. e2e: on a profile, picking 4 days shows 24, a 1.7. start shows 12; the new-employee form has no suggestion

- [x] **T17k Full-year live suggestion** (Req R13, v1.21)
  - Work: `fullYearAllowance()` replaces `suggestedAllowance()` in `lib/employees.ts`; `EmployeeForm` takes `showSuggestion` and tracks only the number of selected working days; label "Vorschlag Urlaubsanspruch pro Jahr: n Tage (30 × n ÷ 5, § 5 BUrlG)"; the "Vorschlag berechnen" box is unchanged.
  - Verify: Vitest: 5→30, 4→24, 3→18, 2→12, 1→6. e2e: a profile with Eintritt in late 2026 and 3 days shows 18; removing a day shows 12; the new-employee form has no suggestion

- [x] **T17l Reminders switch** (Req R15, R24, v1.22)
  - Work: migration `20261127120000_reminders_switch.sql`: `app_settings.reminders boolean not null default false`, the existing row set to false; `due_reminders` returns nothing while it is off. `SWITCHES` in `lib/settings.ts` gets "Urlaubserinnerungen"; e2e setup/teardown include the column.
  - Verify: pgTAP: the column starts off; with the switch off nothing is due and `run_reminders` returns no email and writes no notification; switched on, the existing cases pass. e2e: the switch on Einstellungen saves and shows the message

## Phase D — Go-live
- [ ] **T19 Import** (Req R22)
  - Blocked by Open Question 1.
  - Work: the parser and script.
  - Verify: Vitest for the parser; `--dry-run` totals match
- [ ] **T20a Production URL & database** (v1.10)
  - Work: one `appUrl()` in `lib/app-url.ts` with the fallback `https://plan.mvz-elsharafi.de` (invites, notification and reminder emails); `db push` of all migrations to project `jvmehkgacwozfmuyiuyo`; Vercel env vars; Supabase Auth Site URL; Vault `app_url` = `https://plan.mvz-elsharafi.de`.
  - Verify: typecheck, unit tests; remote migration list matches `supabase/migrations`; login works on `https://plan.mvz-elsharafi.de`
- [ ] **T20 Release** (ask first)
  - Work: `db push` to production, deploy, set the Vault secrets `app_url` and `cron_secret`, the VAPID keys (`npx web-push generate-vapid-keys`) and `VAPID_SUBJECT`, create the admin, real import, full e2e against staging, and a real Android and iPhone (added to the home screen) get a push with the app closed (R27).
  - Verify: every success criterion in `requirements.md` §3
