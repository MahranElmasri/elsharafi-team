# Tasks
Each task gets tests first and is ticked off when done. Each one touches at most ~5 files. `Req` points to the requirements it covers.

## Phase A — Foundation
- [x] **T0 Scaffold**
  - Work: `create-next-app` (TS, Tailwind, App Router, ESLint); add Prettier, Vitest, Playwright; `supabase init`; npm scripts.
  - Verify: `npm run build && npm run lint && npm test`
- [x] **T1 Core schema** (Req R1, R3, R19, R24, R25)
  - Work: `teams`, `absence_types` (with the fixed-type trigger and the 15 seeded types), `app_settings`, `profiles` + trigger, `is_admin`, base RLS, seed.
  - Verify: `npx supabase test db` (RLS: employee reads only their own profile)
- [ ] **T2 Calendar** (Req R5, R6)
  - Work: `berlin_holidays`, `person_workdays`.
  - Verify: pgTAP: 2026 dates; a Mon/Tue/Thu part-timer's 6.–10.4.2026 counts 2 days

## Phase B — Rules in the database
- [ ] **T3 Absence days** (Req R2, R4, R20)
  - Work: `absence_days` + workday trigger, `set_absence`, `day_notes` / `set_note`, `audit_log` triggers.
  - Verify: pgTAP: X on a Saturday fails, a second entry on the same day fails, the audit row is written
- [ ] **T4 Balances** (Req R12, R13, R14)
  - Work: `leave_allowances`, `balances`, `suggested_allowance`.
  - Verify: pgTAP: a joiner on 1.7. with 3 workdays gets 9 days; carry-over 5, 3 days used in March, 2 expired on 1.4.
- [ ] **T5 Requests** (Req R7, R8, R9, R18)
  - Work: `leave_requests`, `request_leave`, `report_absence`, `decide_leave`, `cancel_leave`, `notifications` rows + email payload.
  - Verify: pgTAP: over-balance rejected, overlap rejected, approve re-checks the balance, employee can't decide
- [ ] **T6 Conflicts & team view** (Req R10, R11)
  - Work: `team_day_load`, `request_conflicts`, `team_calendar`.
  - Verify: pgTAP: same team flagged, other team not; the type is never returned
- [ ] **T7 Closures & AU** (Req R16, R17)
  - Work: `closure_days`, `set_closure`, `set_au`, `missing_au`.
  - Verify: pgTAP: closure is safe to repeat, conflicts are listed; a 4-day run without AU is listed
- [ ] **T7b Settings, types & range entry in SQL** (Req R24, R25, R26)
  - Work: switch checks inside the functions from T3–T7, `save_absence_type`, `delete_absence_type`, `type_usage`, `set_absence_range`, `clear_absence_range`.
  - Verify: pgTAP: each switch off → its function rejects or returns nothing, and on again → the old data is back. A hidden type is rejected but old entries still count. A fixed type can't be hidden. A type in use can't be deleted. Bildungsurlaub over 10 days in 2 years produces a warning. A range entry skips non-working and already-taken days.
- [ ] **T8 Retention & cron** (Req R15, R20)
  - Work: `reminder_log`, purge function, `pg_cron` jobs, `pg_net` call.
  - Verify: pgTAP: the purge removes 2022 sick days and keeps vacation

## Phase C — App
- [ ] **T9 Auth shell** (Req R1)
  - Work: `lib/supabase/*`, `middleware.ts`, `/login` (username → Auth-email lookup, one generic error), layout, `scripts/create-admin.mjs`. The script sets the first admin's password directly; this is the bootstrap only, before any admin exists to send invites.
  - Verify: e2e: log in and out; a deactivated user is blocked
- [ ] **T9b Invites & reset** (Req R23)
  - Work: `invite_tokens` migration, `lib/invites.ts`, `/einladung/[token]`, `/passwort-vergessen`.
  - Verify: Vitest for hash and expiry. e2e: create invite → open → set password → logged in. Opening a used link again is refused, and so is an expired link (adjust the clock with SQL). "Passwort vergessen" with an unknown username shows the same message.
- [ ] **T10 Employee management** (Req R19, R13)
  - Work: `/admin/employees` + admin actions (create, ban, delete, "Einladung erstellen" with link + QR + email), the allowance suggestion, team limits.
  - Verify: e2e: add an employee; deleting someone with entries is refused
- [ ] **T11 Grid view** (Req R2)
  - Work: `AttendanceGrid` (read only): month, search, tabs, counts, lines, holidays, today, hatching.
  - Verify: Vitest for the column builder; manual check with 45 rows
- [ ] **T12 Grid editing** (Req R2, R4, R17)
  - Work: click cycle (optimistic), right-click menu, notes, AU, count popover.
  - Verify: Vitest for the cycle; e2e for a grid click
- [ ] **T13 Employee page** (Req R7, R8, R11, R12)
  - Work: `PersonView`, `YearCalendar`, `RequestList`, `/me` forms, Team tab.
  - Verify: e2e: request + sick report; works at 375 px
- [ ] **T14 Approvals panel** (Req R9, R10, R17)
  - Work: `PendingRequests`, `MissingAu`, `/admin/employees/[id]`.
  - Verify: e2e: ⚠ conflict shown → approve
- [ ] **T15 Notifications** (Req R18)
  - Work: `NotificationBell` (Realtime), `lib/mail.ts`, wire up the actions.
  - Verify: Vitest for templates; e2e: the bell updates live
- [ ] **T16 Reminders endpoint** (Req R15)
  - Work: `api/cron/reminders` with a `CRON_SECRET` check, plus logging.
  - Verify: `curl` with the secret writes `reminder_log`; a wrong secret gets 401
- [ ] **T17 Closures & audit pages** (Req R16, R20)
  - Work: `/admin/closures`, `/admin/audit`.
  - Verify: manual and e2e for a closure
- [ ] **T17b Settings page** (Req R24, R25, R26)
  - Work: `/admin/settings` (4 switches + absence-type table with add, edit and show/hide), `lib/settings.ts`, hide the switched-off parts in the grid, `/me` and the request forms, the range-entry form on `/admin/employees/[id]`.
  - Verify: e2e: switching off half days removes the ½ option everywhere; switching off the team calendar removes the Team tab; hiding a type removes it from the menu while old cells still show it; Elternzeit entered for 3 months shows in the grid.
- [ ] **T18 Export & backup** (Req R21)
  - Work: the xlsx and json routes.
  - Verify: e2e download; the file opens and matches the grid

## Phase D — Go-live
- [ ] **T19 Import** (Req R22)
  - Blocked by Open Question 1.
  - Work: the parser and script.
  - Verify: Vitest for the parser; `--dry-run` totals match
- [ ] **T20 Release** (ask first)
  - Work: `db push` to production, deploy, create the admin, real import, full e2e against staging.
  - Verify: every success criterion in `requirements.md` §3
