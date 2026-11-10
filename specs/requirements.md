# Requirements — MVZ El-Sharafi: Anwesenheit & Urlaub
**Status:** Draft v1.1 · **Date:** 2026-11-10

## 1. Objective
Replace the single-PC file `PraxisPlan V2.1.html` with an online app.
- **Admins:** keep the familiar attendance grid and one-click entry.
- **About 45 employees** (Arbeiter, Ärzte, Verwaltung; many part-time): request leave, see their balances, and see when colleagues are absent.
- **Rules:** German leave law (BUrlG, EFZG, the BAG employer-notice requirement) and DSGVO Art. 9 are applied automatically.
- **2026 data:** imported without loss.

**Users**
- **Admin** (practice management): records sick days, approves requests, manages employees, allowances, closures and exports.
- **Employee**: requests leave, reports sick, sees their own balance and the team's absences.

**Success looks like**
- The old file is retired.
- Imported totals match the old app.
- No balance is wrong because of part-time work, holidays or carry-over.

## 2. Requirements & acceptance criteria
Each criterion is written as WHEN/IF … THE SYSTEM SHALL …

### R1 Login
- WHEN a user enters a valid username and password, THE SYSTEM SHALL sign them in and send admins to `/admin` and employees to `/me`.
- IF the account is deactivated, THE SYSTEM SHALL refuse the login and end any session that is still open.
- An admin SHALL never set or see an employee's password (see R23).

### R2 Admin grid
- THE SYSTEM SHALL show employees × Mon–Fri for the selected month, with a name search and category tabs (Arbeiter / Ärzte / Verwaltung).
- Each row SHALL show sick / vacation-taken / remaining counts. WHEN a count is clicked, the system SHALL list those dates.
- A yellow line SHALL mark the month start and a blue line SHALL follow each Friday. Holidays SHALL be a red column that can't be clicked, and today SHALL be highlighted.
- WHEN a cell is clicked, it SHALL cycle empty → X → U → empty and save immediately.
- WHEN a cell is right-clicked, a menu SHALL offer every absence type, half day (morning or afternoon), "AU liegt vor", and a note.
- Markers: an orange dot for a note, a red corner for a missing AU, a faded "?" for pending entries, and hatching on a person's non-working days.

### R3 Absence types
- Types: U Urlaub, B Betriebsurlaub, X Krank, K Kind krank, F Fortbildung, S Sonderurlaub, Ü Überstundenabbau.
- U and B deduct vacation. X and K are health data. X and K are entered directly; U, F, S and Ü need approval when the employee requests them.

### R4 Half days
- A half day (morning or afternoon) SHALL count as 0.5 and show as "½U".

### R5 Part-time patterns
- Each employee has working weekdays. THE SYSTEM SHALL count and allow absences only on those days.

### R6 Berlin holidays
- THE SYSTEM SHALL compute Berlin public holidays for any year. Holidays SHALL NOT be enterable and SHALL NOT count.

### R7 Requests
- An employee SHALL be able to request U/F/S/Ü for a date range, with half-day start/end and an optional substitute from the same category.
- IF a vacation request exceeds the available balance, THE SYSTEM SHALL reject it.
- IF any day already has an entry, THE SYSTEM SHALL reject the request and name the day.
- Accepted requests SHALL appear as pending.

### R8 Sick self-report
- WHEN an employee reports X or K for a range, THE SYSTEM SHALL record it as approved straight away and notify the admins.

### R9 Approval
- An admin SHALL be able to approve or deny a pending request, or cancel an approved one, with an optional note.
- WHEN vacation is approved, THE SYSTEM SHALL re-check the balance.
- The owner SHALL be able to withdraw their own request while it is pending.

### R10 Conflicts & staffing limit
- For each pending request, THE SYSTEM SHALL list colleagues in the same category who are absent within that range.
- Each category has a `max_absent` limit. Days over the limit SHALL be marked red in the grid and in the request.
- Conflicts are a warning only and SHALL NOT block approval.

### R11 Team calendar
- An employee SHALL see their own category's absences, with colleagues shown only as **"abwesend"**.
- The absence type SHALL never be sent to an employee for anyone but themselves.

### R12 Balances
- Per person and year, THE SYSTEM SHALL show: allowance, carry-over (used/expired), taken, pending, available, sick days, and the count for each other type.

### R13 Pro-rata allowance
- THE SYSTEM SHALL suggest an allowance following §5 BUrlG. It scales the full-time days by working days per week (÷ 5) and by the full months employed in that year (÷ 12), rounding up when the fraction is ≥ 0.5.
- The admin confirms the value.

### R14 Carry-over expiry
- Vacation days taken up to 31.3. SHALL use up carry-over first. Anything still unused SHALL expire after 31.3.

### R15 Reminders (BAG employer notice)
- From 1.10., employees with unused days this year SHALL get a monthly reminder.
- From 1.2., employees with carry-over that expires on 31.3. SHALL get a monthly reminder.
- Reminders go by email and in-app. Each one SHALL be logged with date and channel.

### R16 Closure days
- An admin SHALL be able to enter a closure range once. THE SYSTEM SHALL add B days for all active employees on their working days.
- Running it again SHALL be safe. Days that are already taken SHALL be skipped and listed.

### R17 AU tracking
- "AU liegt vor" SHALL apply to a whole run of consecutive sick days.
- Runs longer than 3 calendar days without an AU SHALL be listed for the admin and marked in the grid.

### R18 Notifications
- A live in-app bell plus SMTP email, for:
  - a new request (to admins and the substitute)
  - a sick report (to admins)
  - a decision or cancellation (to the other party)
  - reminders (to employees)
- IF a person has no email address, the email is skipped. IF an email fails, it SHALL be logged and the action SHALL still succeed.

### R19 Employee management
- An admin SHALL be able to add and edit: name, username, email, team, role, working weekdays, start/end date, allowance.
- An admin SHALL be able to activate and deactivate employees.
- Delete SHALL only be possible for an employee with no entries.
- An admin SHALL NOT be able to deactivate or delete themselves.

### R20 Privacy
- Every change to absences, requests, profiles, allowances and closures SHALL be audit-logged (who, when, before/after). Only admins can read the log.
- Health-data days SHALL be deleted after 3 full calendar years.
- Sick details SHALL only reach admins.

### R21 Export & backup
- An admin SHALL be able to download an Excel file (one sheet per month, with letters and totals) and a JSON backup of all data.

### R22 Import
- A one-time import of the PraxisPlan file SHALL bring over employees, X/U days and notes.
- Invalid days SHALL be listed, and old vs. new totals SHALL be printed per employee.

### R23 Invite & password reset
- WHEN an admin clicks "Einladung erstellen", THE SYSTEM SHALL create a single-use link valid for 7 days. Any older unused link for that person SHALL stop working.
- IF the person has an email, THE SYSTEM SHALL email the link. In every case it SHALL show the link plus a QR code to print, scan or share.
- WHEN the link is opened, THE SYSTEM SHALL ask for a new password (at least 10 characters, entered twice), save it, sign the person in, and mark the link used.
- IF the link is used, expired, or belongs to a deactivated account, THE SYSTEM SHALL refuse it with a German message.
- WHEN someone clicks "Passwort vergessen" and enters a username, THE SYSTEM SHALL always answer the same way, so nobody can find out which usernames exist. If that account has an email, the system SHALL email a new link, at most 1 per 15 minutes. Without an email, the page says "bitte an die Praxisleitung wenden".

## 3. Success criteria
- All of R1–R23 are met and covered by the tests in `design.md` §8.
- The import dry-run matches 100%, or every difference is explained.
- The build, lint, typecheck, unit, pgTAP and e2e checks all pass.
- On a phone, the employee pages work at 375 px width. On a desktop, the admin grid handles 45 rows × a full month.
- A pgTAP test proves that an employee session cannot read another person's absence type.

## 4. Not doing (and why)
- **Print view:** not selected; Excel covers paper needs.
- **Blackout periods:** not selected; staffing limits cover most cases.
- **Second language:** German only was chosen.
- **Approval for sick days:** it doesn't match how they're handled today.
- **Rotating schedules, hourly absences, time tracking, shift planning, payroll:** these are a different product.
- **eAU retrieval:** that needs payroll software.
- **iCal, PWA, sick-rate statistics:** not selected.
- **Live grid sync, WhatsApp/SMS, a SmartQ link:** low value, a paid API, and a separate concern.
- **Two-factor login:** not wanted; revisit if admin accounts are ever compromised.

## 5. Open questions
1. **Old data file:** the PraxisPlan "Herunterladen" and/or Excel file, placed in the repo. Blocks R22 / T19.
2. **`.env` values:** `SUPABASE_DB_URL`, `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `APP_URL`, `CRON_SECRET`.
3. **Hosting:** Vercel is the default assumption.
4. **Supabase project:** confirm the EU region and the signed DPA (AVV).
5. **Docker:** installed but not running. It's needed for the local Supabase stack, pgTAP and e2e tests.
6. **Employee details:** working weekdays and contract allowance for each employee.

## 6. Changelog
- **v1 (2026-11-10):** first version, from the planning sessions and the screenshots of the current app.
- **v1.1 (2026-11-10):** R1 changed and R23 added: first login via invite link (email or QR), self-service reset, no admin-set passwords.

