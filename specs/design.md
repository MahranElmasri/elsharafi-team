# Design — MVZ El-Sharafi: Anwesenheit & Urlaub

## 1. Principles
- **The database owns every rule:** counting, balances, conflicts, permissions and notification rows. Next.js renders pages, calls RPCs and sends email.
- **Day-based model:** one row per person and day. A rule only applies when a row is written, so a later pattern change never changes history.
- **No direct writes:** RLS is on everywhere, and writes go only through RPCs.

## 2. Tech stack
- Next.js 15 (App Router, Server Actions), React 19, TypeScript (strict), Tailwind CSS 4
- Supabase: Postgres 17, Auth, RLS, Realtime (notifications only; an arriving one refreshes the open page), `pg_cron`, `pg_net`
- `@supabase/ssr`, `@supabase/supabase-js`, `nodemailer`, `exceljs`, `qrcode`, `web-push` (3.6.7; 4.0.0 was days old)
- Dev tools: Supabase CLI (`npx`), Vitest, Playwright, ESLint, Prettier · Node 24

## 3. Architecture
```
Browser ──(Server Components / Server Actions)──► Next.js ──(RPC, user JWT)──► Postgres (RLS + functions)
   ▲  Realtime: notifications only                    │ nodemailer ──► Practice SMTP
   └──────────────────────────────────────────────────┘ service-role (server-only): user create/ban/delete
pg_cron ─► retention purge (SQL)  ·  pg_net ─► POST {APP_URL}/api/cron/reminders (CRON_SECRET)
notifications INSERT ─► trigger ─► pg_net ─► POST {APP_URL}/api/push (CRON_SECRET) ─► web-push ─► phone
```
- **Accounts:** public sign-up is disabled (`[auth] enable_signup = false` locally; "Allow new users to sign up" must be off in the production dashboard). `[auth.email] enable_signup` stays `true`: switching it off disables email+password login entirely. Accounts are created only through the admin API. The admin API writes `app_metadata` after inserting the user, so a second trigger (`sync_profile_role`) copies `app_metadata.role` into `profiles.role` whenever it changes.
- **Sessions:** `middleware.ts` refreshes the session and sends signed-out visitors to `/login` (public paths: `/login`, `/einladung`, `/passwort-vergessen`, `/api/cron`, `/api/push`; `sw.js` and `manifest.webmanifest` are outside the matcher). Every protected page calls `requireUser(role?)` (`lib/session.ts`), which signs out deactivated accounts and sends them to `/login?gesperrt=1`.
- **Login:**
  - The Auth email is the person's real email when they have one, otherwise `<username>@users.mvz-elsharafi.invalid`.
  - Login always takes the username. A server action looks up the Auth email with the service role and returns one generic error for any failure.
  - "Angemeldet bleiben" (R1): unchecked, the login action sets the browser-session cookie `nur-sitzung=1`; checked, it deletes it. While `nur-sitzung` is present, the server client and the middleware write the Supabase auth cookies without `maxAge`/`expires` (`sessionCookie()` in `lib/supabase/session-cookie.ts`), so they end when the browser closes. Deleting cookies (empty value) keeps its `maxAge: 0`.
  - Changing someone's email also updates their Auth email (`auth.admin.updateUserById`).
- **Invites & reset (R23):**
  - The token is 32 random bytes in base64url. Only its sha256 hash is stored in `invite_tokens`.
  - Creating a token marks all of that person's older unused tokens as used.
  - Redeem: look up `token_hash`, then run an atomic `update … set used_at = now() where used_at is null and expires_at > now() returning user_id`. Check that the profile is active, set the password with `auth.admin.updateUserById`, sign in, and redirect to `/me` or `/admin`.
  - "Passwort vergessen" uses the same mechanism (`purpose = reset`): the link is sent by nodemailer, at most 1 per 15 minutes per person, and the page always gives the same answer.
  - SQL functions (service role only): `create_invite(user, purpose, hash, by)` · `request_reset(username, hash)` (returns the email target, or nothing when the account is unknown, inactive, has no email, or asked within 15 minutes) · `peek_invite(hash)` (`ok` / `unknown` / `used` / `expired` / `inactive`, for the page) · `redeem_invite(hash)` (the atomic update above).
  - Invite email (T10b): `inviteMail()` in `lib/invites.ts` builds a plain-text and an HTML version (username, numbered steps, button, expiry, login address). The QR code is a PNG attached inline (`cid:invite-qr`), because Gmail and Outlook block `data:` images. Names are HTML-escaped. `Mail` in `lib/mail.ts` takes optional `html` and `attachments`. The employee guide `Anleitung/Anleitung-Mitarbeitende.pdf` (printed from `Anleitung-Mitarbeitende.html` with headless Chrome) is read from disk and attached as a normal attachment; `next.config.ts` `outputFileTracingIncludes` ships it with the server bundle. A missing file is logged and the email goes out without it.
  - `lib/mail.ts` never throws. Without `SMTP_HOST` it writes the mail to the server log in development and logs an error in production.
  - **PWA & push (R27, T15c):** `app/manifest.ts` (name "Anwesenheit – MVZ El-Sharafi", short name "Anwesenheit", `start_url` `/`, `display: standalone`, colours from the paper/ink tokens, icons 192 and 512 px from the calendar artwork) and `app/apple-icon.png` (180 px on white, because iOS fills transparency with black). `public/sw.js` handles only `push` (shows the message, title "Anwesenheit") and `notificationclick` (focuses an open window or opens the link); no caching, no offline. The bell registers `/sw.js` on every signed-in page load. `components/PushToggle.tsx` sits in the Meldungen panel and shows "Auf diesem Gerät benachrichtigen" as a switch, or the reason it can't (no support; iPhone: "Erst zum Home-Bildschirm hinzufügen"; permission denied: "In den Browser-Einstellungen erlauben"). On: `pushManager.subscribe` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, then `save_push_subscription`; off: `unsubscribe` and `delete_push_subscription`. A trigger on `notifications` (statement level, transition table) calls `call_app_endpoint('/api/push', {ids})` when one of the recipients has a subscription; that helper (also used by `call_reminders_endpoint`) reads `app_url`/`cron_secret` from Vault and does nothing without them. `app/api/push/route.ts` checks `Bearer {CRON_SECRET}` like the reminders route, loads the notifications and their recipients' subscriptions with the service role, sends `{title, body, url}` through `lib/push.ts` (`web-push`, VAPID keys `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`), deletes subscriptions that answer 404/410 and answers `{ sent, failed, removed }`. Without VAPID keys it answers 503 and logs; the action that created the notification is never affected (pg_net is asynchronous). Locally `app_url` is `http://host.docker.internal:3000`. Logging out (`components/LogoutButton.tsx`) first removes this device's subscription, so a shared phone shows no one else's notifications.
  - Notification emails (T15): `sendAll` wraps each row an RPC returns with `renderNotification`: "Guten Tag,", the message from SQL, "Zur App: {APP_URL}{link}" (only for in-app paths), and a no-reply footer. Rows without an address are skipped.

## 4. Data model (`supabase/migrations`)
| Table | Key columns | Notes |
|---|---|---|
| `teams` | `id` (arbeiter / aerzte / verwaltung), `name`, `sort`, `max_absent` | Seeded |
| `absence_types` | `code` (immutable), `letter` (1–2 characters, unique), `label`, `color`, `entry_mode` (request / report / admin), `deducts_vacation`, `is_health`, `limit_days?`, `limit_years?` (1 / 2), `visible`, `is_fixed`, `sort` | Seeded with the 15 types in requirements R3. `absence_days.type` and `leave_requests.type` reference `code` with **on delete restrict**, so the database blocks deleting a type that is in use. A trigger blocks changes to `entry_mode`, `deducts_vacation`, `is_health`, `visible` and `code` when `is_fixed`. |
| `notify_recipients` | `email text primary key` (lower case, valid address, ≤ 254 chars), `created_at` | Admins only (read, insert, delete); audit-logged. Kept out of `app_settings`, which every signed-in user can read. `reception_notice(who, from, to, on)` returns one email per address (name and dates, `link` null, no in-app row); called by `report_absence`, `decide_leave` on approval and `cancel_leave` when an approved leave is cancelled (R18, v1.15), and by the admin's overview writes (v1.19): `set_absence` (a new day → away; removing a day → in; a type or half change → nothing), `set_absence_range` (days added) and `clear_absence_range` (days removed). These three return jsonb with `emails`; `setCell` and `saveRange` send them with `sendAll`. `appUrl()` keeps only the origin of `APP_URL`. |
| `app_settings` | single row (`id boolean primary key default true check (id)`): `team_calendar`, `half_days`, `substitutes`, `au_tracking` (all `boolean default true`), `reminders` (`boolean default false`, v1.22) | Readable by every signed-in user. Only admins can update it, and changes are audit-logged. |
| `profiles` | `id` → `auth.users`, `username` (unique), `full_name`, `notify_email?`, `role`, `team_id`, `active`, `workdays smallint[]`, `start_date`, `end_date?`, `sort` | Created by a trigger on `auth.users`. `role` comes from `app_metadata`. |
| `leave_allowances` | PK `(user_id, year)`, `days numeric(4,1)`, `carryover numeric(4,1)` | |
| `leave_requests` | `id`, `user_id` (restrict), `type`, `start_date`, `end_date`, `start_half`, `end_half`, `substitute_id?`, `note`, `status`, `decided_by/at`, `decision_note` | |
| `absence_days` | PK `(user_id, day)`, `type`, `amount` (1 / 0.5), `half?`, `status` (pending / approved), `request_id?`, `au_received`, `created_by` | A trigger rejects non-working days. FK `user_id` is restrict, so the database itself blocks deleting employees who have entries. |
| `closure_days` | PK `day`, `note` | |
| `day_notes` | PK `(user_id, day)`, `note`, `updated_by`, `updated_at` | Admin-only (read and write): notes can hold internal remarks |
| `notifications` | `id`, `user_id`, `message`, `link`, `read_at`, `created_at` | Realtime publication; an insert trigger hands new rows to `/api/push` |
| `push_subscriptions` | `id`, `user_id` (cascade), `endpoint` (unique), `p256dh`, `auth`, `created_at` | One row per device. RLS: a person reads only their own rows; writes only through `save_push_subscription(endpoint, p256dh, auth)` (upsert on `endpoint`, so a shared device moves to whoever signed in last) and `delete_push_subscription(endpoint)` (own rows only). The push route reads them with the service role. |
| `audit_log` | `id`, `actor`, `table_name`, `row_key`, `action`, `old`, `new`, `at` | Written by triggers; admins can read it |
| `invite_tokens` | `id`, `user_id` (cascade), `token_hash` (sha256, unique), `purpose` (invite / reset), `expires_at`, `used_at?`, `created_by?`, `created_at` | RLS on with no policies: service role only |
| `reminder_log` | `user_id`, `kind`, `year`, `days_at_risk`, `for_month` (the month the notice is for, from `as_of`), `sent_at`, `channel` | Proof of the employer notice |

## 5. Functions
All functions use `set search_path = public`, revoke `anon`, and run an explicit `is_admin()` or owner check. Errors are raised as German messages.

- **Calendar:** `berlin_holidays(year)` (Gauss/Meeus) · `person_workdays(user, a, b)`
- **Allowance:** `suggested_allowance(user, year, fulltime_days)` · `balance_of(user, year, as_of)` (yourself or admin) and `balances(year, as_of)` (security invoker; one row per visible profile). They return `remaining` = allowance + carry-over − expired − taken, and `available` = remaining − pending. Requests are checked against `available`. The employee profile shows the full-year value live under the working days: `fullYearAllowance(n)` in `lib/employees.ts` = 30 × n ÷ 5 (R13, v1.21); no month scaling, so dates do not matter.
- **Writes:**
  - `set_absence(user, day, type|null, half|null)` (admin)
  - `report_absence(type, a, b, note, substitute?)` (employee; the substitute is checked like in `request_leave` and notified at once with "abwesend", never the type; not stored). Days that already have an entry are skipped and returned in `skipped`. Sick during vacation (§9 BUrlG: vacation days covered by an AU are credited back) is handled by the admin changing the cell from U to X.
  - `request_leave(...)` (notifies the admins only), `decide_leave(id, approve, note)` (uses `FOR UPDATE`; on approval also notifies `substitute_id`), `cancel_leave(id)` (an admin cancelling an approved request also tells `substitute_id`). Substitute messages carry name and dates only. Migration `20261117120000_substitute_notify.sql`.
  - `set_closure(a, b, note)` and `remove_closure(a, b)` (admin; at most 31 days per closure)
  - `set_au(user, day, received)` (admin)
  - `set_note(user, day, text|null)` (admin)
  - `set_absence_range(user, a, b, type)` and `clear_absence_range(user, a, b, type)` (admin; R26). They return the days that were skipped.
  - Employees (admin; R19, R13): `employee_conflict(user, username, email)` (German message or null) · `save_employee(...)` · `set_employee_active(user, active)` (also voids open invite links) · `delete_employee(user)` (only without entries; deletes the Auth user, which cascades) · `set_allowance(user, year, days, carryover)` · `set_team_limit(team, max)`. Nobody can deactivate, delete or demote themselves. The server action creates the Auth account and afterwards updates its login email, `app_metadata.role` and ban (`876000h` when deactivated, `none` when reactivated).
  - `save_absence_type(...)` and `delete_absence_type(code)` (admin; R25)
- **Feature switches (R24)**, enforced inside the functions:
  - `half_days` off → `request_leave`, `set_absence` and `set_absence_range` reject half-day input.
  - `substitutes` off → `request_leave` and `report_absence` ignore the substitute, and no substitute is notified (also not on approval or cancellation).
  - `team_calendar` off → `team_calendar()` returns nothing for non-admins.
  - `au_tracking` off → `missing_au()` returns nothing, and `set_au` is rejected.
  - `reminders` off → `due_reminders()` returns nothing, so `run_reminders()` writes no in-app reminder and returns no email.
  - Hidden types (`visible = false`) are rejected by `request_leave`, `report_absence`, `set_absence` and `set_absence_range`.
  - `entry_mode` decides the path: `request` → `request_leave` (pending); `report` → `report_absence` (approved); `admin` → admin functions only.
- **Limits (R25):** `type_usage(user, type, as_of)` returns used / limit over the type's window. `request_limit_warnings()` (admin) lists pending requests that would exceed their type's limit; approved and pending days both count. Warning only.
- **Reads:** `team_day_load(a, b)` · `request_conflicts()` (colleague, type, status, days) · `request_over_limit()` (days over `max_absent`) · `missing_au()` · `team_members()` (colleagues' names and workdays, for hatching) · `team_calendar(a, b)` (security definer; returns only `(user_id, full_name, day, status)`). The last two return nothing when the team-calendar switch is off. All five skip admin accounts (v1.13); the grid and the export filter `role = 'employee'` too.
- **RPC results:** RPCs that notify people return the rows to email (`[{ user_id, email, subject, text }]`). Server actions send those emails.
- **Reminders (R15, service role only):** `due_reminders(as_of)` decides who is due: `year_end` from 1.10. (available > 0), `carryover` 1.2.–31.3. (unused carry-over), at most once per kind and month (checked on `for_month`, so a run for another `as_of` month is not confused with the real send time). `run_reminders(as_of)` writes the in-app notification, logs `in_app` in `reminder_log` and returns the emails. The endpoint calls `log_reminder_email(user, kind, year, days, as_of)` after each email is sent. `balance_of` also accepts the service role for this.
- **Scheduled jobs:** `purge_health_data(today)` runs monthly (1st, 03:00 UTC). It deletes `is_health` days before 1.1. three years back, plus their notes and audit rows, and leaves one summary audit row. `call_reminders_endpoint()` runs daily (06:00 UTC). It posts to `{app_url}/api/cron/reminders` with `Bearer {cron_secret}`; both values are read from Supabase Vault (`app_url`, `cron_secret`, set at release in T20) and the call does nothing until they exist. The endpoint (T16, `app/api/cron/reminders/route.ts`) accepts only `POST` with `Authorization: Bearer {CRON_SECRET}` (constant-time compare; wrong or missing: 401; `CRON_SECRET` unset: 503). It calls `run_reminders(as_of)` with the service role, sends each email through `renderNotification`, calls `log_reminder_email` only for emails that went out, and answers `{ asOf, emailsSent, emailsFailed }`. `as_of` is today in Berlin; an optional JSON body `{ "asOf": "YYYY-MM-DD" }` overrides it (for tests and catching up a missed day).

## 6. Project structure
```
app/login · app/me · app/admin · app/admin/employees (list, add, team limits) · app/admin/employees/[id] (T10: details, allowance, invite, account; T14 adds the person view) · app/admin/closures (T17: `?jahr=`; form Von/Bis/Notiz → `set_closure`, reports the days added and lists skipped entries; the year's closures as ranges with "Entfernen" after a confirm → `remove_closure`) · app/admin/audit (T17: newest first, 50 per page `?seite=`, filters `?bereich=` table and `?person=` id; columns Zeit, Wer, Bereich, Was, Änderung; formatting in `lib/audit.ts`). Admin nav: Übersicht, Mitarbeitende, Schließungen, Protokoll.
app/admin/settings (T17b: four switches, five since T17l (`role=switch`) that save on click via an `app_settings` update (admin RLS); absence-type table, one expandable form per type (Bezeichnung, Zeichen, Farbe from the six inks, Eingetragen von, Zieht Urlaub ab, Gesundheitsdaten, Grenze Tage/Jahre, Reihenfolge; Sichtbar only when adding) → `save_absence_type`, which keeps the stored visibility for an existing type; T17c: each non-fixed row has a "Sichtbar" switch (`role=switch`, shared `components/Switch.tsx`, also used by the four feature switches) next to its summary that saves on click via `setTypeVisible` (reads the row, calls `save_absence_type` with only `visible` changed); fixed types show only label, letter, colour and order; "Löschen" for unused non-fixed types → `delete_absence_type`; "Neue Art" derives the immutable code from the label (umlauts transliterated, `_2` added on a clash, so an existing type is never overwritten)) · `/admin/employees/[id]` gets "Zeitraum eintragen" (T17b: Art (visible types), Von, Bis; "Eintragen" → `set_absence_range`, "Entfernen" → `clear_absence_range`; lists skipped days and, after entering, warns "x von y Tagen genutzt" from `type_usage` when a limit is exceeded). Admin nav adds Einstellungen.
app/einladung/[token] (set password) · app/passwort-vergessen
app/admin/export (T18: `GET ?jahr=` → `Anwesenheit-{jahr}.xlsx`, built in `lib/export.ts`: one sheet per month, people as rows, Mo–Fr days as columns like the grid; cells hold the type letter, `½` before half days, holidays filled red with the holiday's name in the header; approved days only, since the file goes to payroll; totals per row: Krank, Urlaub (types that deduct vacation), Sonstige; plus a sheet "Jahr" with each person's balance from `balances(year)`) · app/admin/backup (T18: `GET` → `Sicherung-{datum}.json`: `{ created_at, tables: {...} }` with every public table the admin can read through RLS; `notifications` (short-lived, readable only by their owner) and `invite_tokens` (secret hashes) are left out). Both routes call `requireUser("admin")`, send `Cache-Control: no-store`, and are linked from the overview next to the month ("Excel {jahr}", "Datensicherung"). · app/api/cron/reminders
app/actions.ts                 → server actions: RPC → email → revalidate
components/                    → AttendanceGrid, GridMenu, BalanceDetails, admin/ApprovalsDrawer, me/{MeActions, MonthCalendar, TeamCalendar, RequestList},
                                 NotificationBell (T15: "Meldungen n" in the header for everyone; the latest 20, live via Realtime INSERTs filtered to the user; opening it marks all read. Each INSERT also calls `router.refresh()`, so the open page's server data (grid, "Offene Anträge", `/me` calendar and list) reloads in place; client state such as open dialogs and typed input is kept. Grid edits that send no notification are not synced live.)
app/favicon.ico (16/32/48 px) + app/icon.png (512 px): the coloured calendar icon (Next.js file convention adds the `<link rel="icon">` tags)
lib/supabase/{server,browser,admin}.ts · lib/notifications.ts + lib/notice.ts (bell data) · lib/mail.ts · lib/settings.ts (reads app_settings + visible types for the UI) · lib/invites.ts (create / hash / redeem) · lib/dates.ts · lib/labels.ts (German text)
supabase/migrations/ (schema + reference data: teams, absence types, settings row) · supabase/seed.sql (local test users only) · supabase/tests/ (pgTAP)
lib/employees.ts (form parsing) · lib/people.ts (last sign-in per account) · lib/grid.ts (month columns, display helpers) · lib/grid-data.ts (loads one month for the grid: entries, holidays, notes, missing AU, balances, team load) · app/actions/grid.ts (setCell, saveNote, setAu, listDays: thin wrappers over the SQL functions) · components/GridMenu.tsx (cell context menu)
tests/ (Vitest) · e2e/ (Playwright; 2 workers and a 15 s expect timeout against the dev server) · scripts/ (create-admin, import-praxisplan) · specs/
```

## 7. Code style
- TypeScript strict, no `any`. Server Components by default; `"use client"` only for the grid, bell and forms.
- **No business rules in TypeScript.** If a rule matters, it goes in SQL with a pgTAP test.
- Names: `camelCase` in TypeScript, `snake_case` in SQL, components in `PascalCase.tsx`. User-facing text lives in `lib/labels.ts`.
- Prettier defaults with 100-character lines. Comments only where the reason isn't obvious.

```ts
"use server";
export async function requestLeave(input: RequestLeaveInput): Promise<ActionResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("request_leave", input);
  if (error) return { ok: false, message: error.message }; // German message from SQL
  await sendAll(data.emails);                                // logs failures, never throws
  revalidatePath("/me");
  return { ok: true };
}
```

## 8. Testing strategy
| Level | Tool | Covers |
|---|---|---|
| Database | pgTAP (`supabase/tests/*.sql`) | Every rule: holidays, part-time counting, half days, balances and expiry, pro-rata, overlaps, staffing load, closures, AU runs, RLS, `team_calendar` masking, retention |
| Unit | Vitest (`tests/`) | Grid click cycle, date helpers, mail templates, import parser, push payload and expired-subscription handling |
| End-to-end | Playwright (`e2e/`) | Login; invite → set password; used/expired link refused; request → ⚠ conflict → approve → bell; sick report; grid click; deactivate blocks login; export; manifest served and `sw.js` registered |
| Data | `import-praxisplan --dry-run` | Old vs. new totals per employee |

Each pgTAP file first empties the tables inside its own transaction (rolled back at the end), so local data never affects the result. The switches can be changed in the app, so `e2e/global-setup.ts` saves them, turns all on for the run and `global-teardown.ts` restores them (one file per run); each pgTAP file sets them on inside its rolled-back transaction. `e2e/settings.spec.ts` switches practice-wide settings, so Playwright runs it as its own project after all other tests (`dependencies`), never alongside them.

Tests are written red → green, alongside each task. A failing test is never deleted or weakened without approval.

## 9. Commands
```bash
npm run dev | build | lint | format | typecheck
npm test                 # vitest run
npm run test:e2e         # playwright (local Supabase + dev server; runs in the installed Google Chrome,
                         #   because Playwright's Chromium does not support macOS 13)
npx supabase start       # local stack (Docker); Realtime must run for the bell (do not exclude it with -x)
npx supabase test db     # pgTAP
npx supabase db reset    # re-apply migrations + seed locally
npx supabase db push --db-url "$SUPABASE_DB_URL"   # production — ask first
# Production: Vercel at https://plan.mvz-elsharafi.de, Supabase project jvmehkgacwozfmuyiuyo.
# APP_URL builds every link in emails, invites and QR codes (lib/app-url.ts). It falls back to the
#   production domain, so local dev sets APP_URL=http://localhost:3000 in .env.local.
node --env-file=.env.local scripts/create-admin.mjs <username> "<Name>" <password> [email]
# Local development reads .env.local (keys from `npx supabase status -o env`), which overrides .env.
node scripts/import-praxisplan.mjs <file> [--dry-run]
```

## 10. Boundaries
- **Always:**
  - Update `specs/` before implementing anything new.
  - Run lint, typecheck, unit tests and pgTAP before each commit.
  - Keep RLS on every table, validate input on the server, and keep health data admin-only.
- **Ask first:**
  - A production `db push`.
  - A new dependency.
  - Changing legal rules or retention.
  - Real emails to staff.
  - The production import.
  - Deleting data.
- **Never:**
  - Commit `.env` or keys, or use the service-role key in the browser.
  - Expose absence types to colleagues.
  - Disable RLS.
  - Edit an applied migration.
  - Skip or delete a failing test.
  - Build anything that isn't in the specs.


## 11. UI design — "pencil and ink"
- **Password fields:** `components/PasswordInput.tsx` (label, input, eye button). The button is `type="button"`, a toggle with the fixed name "Anzeigen" (`aria-pressed` carries the state, so `getByLabel("Passwort")` still finds only the input) and the tooltip "Passwort anzeigen"/"Passwort verbergen"; the icons are inline SVG, no icon package.

**The idea:** a paper duty roster is pencilled in first and inked once it's confirmed. The app does the same:
- **Pending entries** are pencil: Bleistift grey, a dashed outline, the letter in grey.
- **Approved entries** are ink: a solid round stamp in the type's colour.

This is the one bold visual element. Everything else stays quiet.

**Second motif:** the MVZ appointment card's "Mo Di Mi Do Fr" circles. Each person's working weekdays show as 5 small circles, filled on the days they work. They appear in the grid's name column and on the phone page.

**Colour tokens** (the old app's meanings are kept: red X, blue U, yellow today, red holidays):
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F6F8F7` | Page background |
| `ink` | `#1D2B34` | Text, approved outlines |
| `krank` | `#C42F2A` | X/K stamps; holiday columns as a pale tint |
| `urlaub` | `#2446A6` | U/B stamps |
| `marker` | `#FFE14D` | Today's column, like a highlighter |
| `pencil` | `#8C959B` | Pending entries, gridlines, secondary text |

Other types use muted inks (green `#2F7A55`, violet `#6A4C9C`, brown `#8A5A2B`, slate `#4F6470`), set per type in `absence_types.color`. A dark theme inverts paper and ink and keeps the stamp colours, lightened for contrast.

**Type:**
- Atkinson Hyperlegible Next (Google Fonts) only, chosen for legibility across mixed language backgrounds.
- Tabular figures in the grid.
- The month title is large and set slightly tight.
- No all-caps labels, no monospace, sentence case everywhere.

**Layout:**
- **Admin:** `/admin?monat=YYYY-MM` (default: this month in Berlin time). One continuous ruled sheet; no cards. Group tabs (default "Alle") and the name search filter on the client. With a group tab selected, the day header shows "n von max" in red when more people are absent than `max_absent` allows. The Rest count shows "–" when no allowance is entered for the year. Editing (T12): a click shows the change at once and rolls it back with the database's German message if refused; after the last pending save the page refreshes from the server. Plain click cycles frei → X → U → frei; on another type it opens the menu, on a pending day it points to the request. Right-click, the context-menu key or Shift+F10 opens the menu; arrow keys move between cells. The X and U counts open the dates behind them. The name column is sticky and holds the weekday circles plus the X / U / Rest counts. A week line follows each Friday, and the month start is marked. "Offene Anträge" opens as a drawer from the right, so the grid keeps its width. T14: the buttons "Offene Anträge n" and "AU fehlt n" (hidden when AU tracking is off) sit next to the month title and open the same drawer (`components/admin/ApprovalsDrawer.tsx`, data from `lib/requests-data.ts`). Each request card lists overlapping colleagues (with type, admins only), days over the group limit ("2 von 1"), the type limit ("x von y Tagen"), and the vacation left after approval; then an optional message and "Genehmigen" / "Ablehnen" (`app/actions/requests.ts`). Clicking a pencilled day in the grid, or "Antrag öffnen" in its menu, opens the drawer at that request. The person view on `/admin/employees/[id]` shows the year's R12 figures and the requests, where pending or approved ones can be cancelled with an optional message.
- **Staff (phone first):**
  - A plain sentence, "Sie haben noch 14 Urlaubstage", with "beantragt" and "genommen" beneath it.
  - The weekday circles.
  - Two buttons: "Urlaub beantragen" and "Krank melden".
  - A month calendar and "Meine Anträge".
  - T13: `/me?monat=YYYY-MM&ansicht=team`. The two forms open as dialogs; the database's message is shown in the dialog. "Alle Zahlen" lists every R12 figure. Tabs "Mein Kalender" / "Team" (Team hidden when the switch is off). Pending requests can be withdrawn from "Meine Anträge". `lib/me-data.ts` loads the page; `app/actions/me.ts` (requestLeave, reportSick, withdrawRequest) sends the emails the RPC returns via `sendAll` in `lib/mail.ts`.

**Voice:**
- Staff are addressed as **"Sie"**.
- Buttons say exactly what they do ("Urlaub beantragen", "Genehmigen"). The matching confirmation uses the same word ("Beantragt", "Genehmigt").
- Errors say what's wrong and how to fix it, with no apology.

**Quality floor:**
- WCAG AA contrast.
- Visible keyboard focus. The grid can be operated by keyboard: arrow keys move between cells, Space cycles the entry, and the context-menu key opens the menu.
- The state never relies on colour alone: the letter and the dashed or solid style carry it too.
- `prefers-reduced-motion` is respected.
- The only motion is the stamp "press" when an entry is approved.

**Prototype:** a clickable static prototype (sample data, no backend) is published at https://claude.ai/artifact/PZ7XnNNYahLBTWHsnsLjdK (private). Feedback on it goes back into this section before T11.
