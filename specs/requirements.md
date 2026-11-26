# Requirements — MVZ El-Sharafi: Anwesenheit & Urlaub
**Status:** Draft v1.2 · **Date:** 2026-11-10

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
- The login form SHALL mark its fields as username and current password, so the browser's password manager can save and fill them.
- The login form SHALL have an "Angemeldet bleiben" box, checked by default. WHEN it is checked, THE SYSTEM SHALL keep the user signed in until they log out. WHEN it is unchecked, THE SYSTEM SHALL keep the session only until the browser is closed.
- An admin SHALL never set or see an employee's password (see R23).

### R2 Admin grid
- Accounts with the admin role are not staff. THE SYSTEM SHALL NOT show them in the grid, the team calendar (R11), the Vertretung list, the staffing counts and conflict warnings (R10) or the Excel export (R21). They SHALL stay listed under Mitarbeitende so they can be managed.
- THE SYSTEM SHALL show employees × Mon–Fri for the selected month, with a name search and category tabs (Arbeiter / Ärzte / Verwaltung).
- Each row SHALL show sick / vacation-taken / remaining counts. WHEN a count is clicked, the system SHALL list those dates.
- A yellow line SHALL mark the month start and a blue line SHALL follow each Friday. Holidays SHALL be a red column that can't be clicked, and today SHALL be highlighted.
- WHEN a cell is clicked, it SHALL cycle empty → X → U → empty and save immediately.
- WHEN a cell is right-clicked, a menu SHALL offer every visible absence type, half day (morning or afternoon), "AU liegt vor", and a note. Options switched off in Settings (R24) SHALL NOT appear.
- Markers: an orange dot for a note, a red corner for a missing AU, a faded "?" for pending entries, and hatching on a person's non-working days.

### R3 Absence types
- THE SYSTEM SHALL start with these types (managed afterwards under R25):

| Code | Letter | Label | Entered by | Deducts vacation | Health data | Limit (warning) | Fixed |
|---|---|---|---|---|---|---|---|
| vacation | U | Urlaub | request | yes | | | yes |
| closure | B | Betriebsurlaub | admin | yes | | | yes |
| sick | X | Krank | report | | yes | | yes |
| child_sick | K | Kind krank | report | | yes | | |
| training | F | Fortbildung | request | | | | |
| education | BU | Bildungsurlaub (Berliner Bildungszeitgesetz) | request | | | 10 days / 2 years | |
| special_wedding | SH | Sonderurlaub Hochzeit | request | | | 1 day / year | |
| special_birth | SG | Sonderurlaub Geburt eines Kindes | request | | | 1 day / year | |
| special_death | ST | Sonderurlaub Todesfall | request | | | 2 days / year | |
| special_move | SU | Sonderurlaub Umzug | request | | | 1 day / year | |
| special_other | S | Sonderurlaub sonstige | request | | | | |
| overtime | Ü | Überstundenabbau | request | | | | |
| unpaid | UU | Unbezahlter Urlaub | request | | | | |
| parental | EZ | Elternzeit | admin | | | | |
| maternity | MS | Mutterschutz | admin | | yes | | |

"Entered by": **request** = the employee requests it and an admin approves; **report** = the employee enters it directly; **admin** = only an admin can enter it.

- Only types marked "deducts vacation" SHALL reduce the vacation balance. Health-data types SHALL follow R11 and R20.

### R4 Half days
- A half day (morning or afternoon) SHALL count as 0.5 and show as "½" plus the letter (e.g. "½U").
- IF the "Half days" switch is off (R24), THE SYSTEM SHALL hide the option and reject new half-day entries.

### R5 Part-time patterns
- Each employee has working weekdays. THE SYSTEM SHALL count and allow absences only on those days.

### R6 Berlin holidays
- THE SYSTEM SHALL compute Berlin public holidays for any year. Holidays SHALL NOT be enterable and SHALL NOT count.

### R7 Requests
- An employee SHALL be able to request any visible type marked "request" for a date range, with half-day start/end and an optional substitute from the same category.
- IF the "Substitute" switch is off (R24), the substitute field SHALL be hidden and not saved.
- WHEN an admin approves a request with a substitute, THE SYSTEM SHALL notify the substitute (in-app and email) with the name and dates only, never the type or note. The substitute SHALL NOT be notified when the request is made, denied or withdrawn while pending.
- WHEN an admin cancels an approved request with a substitute, THE SYSTEM SHALL tell the substitute that the absence is off.
- IF a vacation request exceeds the available balance, THE SYSTEM SHALL reject it.
- IF any day already has an entry, THE SYSTEM SHALL reject the request and name the day.
- Accepted requests SHALL appear as pending.

### R8 Sick self-report
- WHEN an employee reports X or K for a range, THE SYSTEM SHALL record it as approved straight away and notify the admins.
- The report SHALL accept an optional substitute from the same team (R7 rules and switch). WHEN one is chosen, THE SYSTEM SHALL notify them at once with the name and dates only; the words "krank" or the type SHALL NOT appear.

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
- Above the colleagues' rows, THE SYSTEM SHALL show each working day's weekday initial and day number, aligned with the day columns; today and holidays SHALL be marked the same way as in the rows.
- The absence type SHALL never be sent to an employee for anyone but themselves.
- IF the "Team calendar" switch is off (R24), THE SYSTEM SHALL return no colleague data to employees and hide the Team tab.

### R12 Balances
- Per person and year, THE SYSTEM SHALL show: allowance, carry-over (used/expired), taken, pending, available, sick days, and the count for each other type.

### R13 Pro-rata allowance
- THE SYSTEM SHALL suggest an allowance following §5 BUrlG. It scales the full-time days by working days per week (÷ 5) and by the full months employed in that year (÷ 12), rounding up when the fraction is ≥ 0.5.
- The admin confirms the value.
- WHEN the admin selects working days in an employee's profile, THE SYSTEM SHALL show the full-year allowance 30 × working days ÷ 5 at once (5→30, 4→24, 3→18, 2→12, 1→6), independent of the start/end date, without saving it.

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
- IF the "AU tracking" switch is off (R24), THE SYSTEM SHALL hide the AU option, list and marks. Stored AU flags SHALL be kept.

### R18 Notifications
- A live in-app bell plus SMTP email, for:
  - a new request (to admins)
  - an approved request, or the cancellation of an approved one (to the substitute; R7)
  - a sick report (to the substitute, if one is chosen; R8)
  - a sick report (to admins)
  - a decision or cancellation (to the other party)
  - reminders (to employees)
- Reception emails: on Einstellungen, an admin SHALL be able to add and remove email addresses (e.g. the reception). THE SYSTEM SHALL email each address "{Name} ist {am Tag | vom … bis …} nicht in der Praxis.":
  - WHEN an employee reports sick, at once;
  - WHEN an admin approves a request (vacation or any other type), not before;
  - and "{Name} ist … doch in der Praxis." WHEN an admin cancels an approved leave.
  - WHEN an admin enters an absence in the overview for a day that had none (grid click, menu or "Zeitraum eintragen"), at once: one email per action, covering the first to the last day entered. Changing the type or half of a day that already has an entry SHALL NOT be sent.
  - "{Name} ist … doch in der Praxis." WHEN an admin removes an entered absence in the overview (grid or "Zeitraum entfernen"): one email per action, covering the first to the last day removed. IF nothing was entered or removed, nothing SHALL be sent.
  - New requests, withdrawn pending requests and denials SHALL NOT be sent. The email SHALL carry the name and dates only: never the type, the reason or a note, and no link to the app. It is email only, with no in-app notice.
  - IF an address is not a valid email, THE SYSTEM SHALL refuse it with a message. Only admins SHALL be able to read or change the list, and changes SHALL be audit-logged.
- IF a person has no email address, the email is skipped. IF an email fails, it SHALL be logged and the action SHALL still succeed.
- WHEN an in-app notification arrives, THE SYSTEM SHALL reload the data of the page the person has open, without a full page reload: the admin grid and "Offene Anträge" count show a new request or sick report, and the employee's calendar and request list show a decision or cancellation.
- The reload SHALL keep open dialogs, typed input and the scroll position.

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
- The invite email SHALL contain the person's username, the steps to set the password (open the link or scan the QR code, enter a password of at least 6 characters (letters or digits, no other rules) twice, save, then log in with username and password), the link, the QR code of the link, and when the link expires. It SHALL also be readable as plain text.
- The invite email SHALL attach the employee guide `Anleitung-Mitarbeitende.pdf` (set password, log in, install the app, request leave, report sick) and say so in the text. IF the file can't be read, THE SYSTEM SHALL still send the email without it.
- WHEN the link is opened, THE SYSTEM SHALL ask for a new password (at least 6 characters (letters or digits, no other rules), entered twice), save it, sign the person in, and mark the link used.
- Every password field (login, set password) SHALL have an eye button. WHEN it is clicked, THE SYSTEM SHALL show the typed password as text; a second click SHALL hide it again. The button SHALL be keyboard-reachable and announce its state.
- IF the link is used, expired, or belongs to a deactivated account, THE SYSTEM SHALL refuse it with a German message.
- WHEN someone clicks "Passwort vergessen" and enters a username, THE SYSTEM SHALL always answer the same way, so nobody can find out which usernames exist. If that account has an email, the system SHALL email a new link, at most 1 per 15 minutes. Without an email, the page says "bitte an die Praxisleitung wenden".

### R24 Settings (show/hide features)
- An admin SHALL be able to switch these features on or off for the whole practice: **Team calendar** (R11), **Half days** (R4), **Substitute** (R7), **AU tracking** (R17). All four are on by default.
- Each switch SHALL be enforced by the database as well as hidden in the UI.
- Switching a feature off SHALL NOT delete any data. Switching it back on SHALL restore it as it was.
- Every change to a switch SHALL be audit-logged (R20).

### R25 Absence type management
- An admin SHALL be able to add a type and edit its label, letter (1–2 characters, unique), colour, "entered by" (request / report / admin), "deducts vacation", "health data", an optional limit (days per 1 or 2 calendar years), and its sort order.
- An admin SHALL be able to hide or show each type. Hidden types SHALL disappear from forms and menus, while existing entries stay visible and keep counting.
- WHEN the admin clicks a type's "Sichtbar" switch in the type list, THE SYSTEM SHALL save the new visibility at once, without opening the type's form. Fixed types SHALL have no switch.
- Saving a type's form SHALL NOT change its visibility; only the switch does (a new type starts visible unless unticked).
- A type that has entries SHALL NOT be deletable, only hidden.
- The fixed types Urlaub, Betriebsurlaub and Krank SHALL NOT be hidden or have their rules changed, because the grid click cycle, balances and closures depend on them. Their label and colour can still be changed.
- WHEN a request or entry would go over a type's limit, THE SYSTEM SHALL warn the admin and show "x of y days used". It SHALL NOT block the entry.
- A type's code SHALL never change once created. Changing the "health data" flag SHALL apply to all existing entries of that type.

### R26 Admin range entry
- An admin SHALL be able to enter any visible type for a date range for one employee (e.g. Elternzeit for 12 months). THE SYSTEM SHALL write approved days on that person's working days only, skip days that are already taken, and list them.
- An admin SHALL be able to remove all of that person's entries of one type within a date range in one step.

### R27 Mobile app (PWA) and push notifications
- THE SYSTEM SHALL provide a web app manifest and icons so the app can be added to a phone's home screen and opens full screen, without the browser bar.
- Each person SHALL be able to switch push notifications on or off for the current device in the "Meldungen" panel. Switching on SHALL ask the browser for permission; switching off SHALL remove that device's subscription.
- WHEN a notification is created for a person (R18), THE SYSTEM SHALL send a push message with its text to each of that person's devices, also when the app is closed. Tapping it SHALL open the app at the notification's link.
- IF push is not possible on a device (unsupported browser, iPhone not added to the home screen, permission denied), THE SYSTEM SHALL say why instead of showing the switch. The bell and email keep working.
- IF a device's subscription has expired, THE SYSTEM SHALL delete it. A failed push SHALL NOT affect the action that caused the notification.
- A person SHALL only be able to read and remove their own device subscriptions.
- The app SHALL NOT work offline.

## 3. Success criteria
- All of R1–R27 are met and covered by the tests in `design.md` §8.
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
- **iCal, offline use, sick-rate statistics:** not selected. (The PWA itself was added in v1.5 as R27.)
- **Live sync of every grid edit, WhatsApp/SMS, a SmartQ link:** low value, a paid API, and a separate concern. Changes that send a notification do update live (R18).
- **Two-factor login:** not wanted; revisit if admin accounts are ever compromised.
- **Automatic vacation reduction for Elternzeit (§17 BEEG):** the employer may cut 1/12 of the allowance per full month of Elternzeit, but this is optional and needs written notice. The admin adjusts the allowance by hand.
- **Per-employee or per-team switches:** all switches apply to the whole practice.

## 5. Open questions
1. **Old data file:** the PraxisPlan "Herunterladen" and/or Excel file, placed in the repo. Blocks R22 / T19.
2. **`.env` values:** `SUPABASE_DB_URL`, `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `APP_URL`, `CRON_SECRET`.
3. **Hosting:** decided (v1.10): Vercel at `https://plan.mvz-elsharafi.de`, hosted Supabase project `jvmehkgacwozfmuyiuyo`.
4. **Supabase project:** confirm the EU region and the signed DPA (AVV).
5. **Docker:** installed but not running. It's needed for the local Supabase stack, pgTAP and e2e tests.
6. **Employee details:** working weekdays and contract allowance for each employee.

## 6. Changelog
- **v1 (2026-11-10):** first version, from the planning sessions and the screenshots of the current app.
- **v1.1 (2026-11-10):** R1 changed and R23 added: first login via invite link (email or QR), self-service reset, no admin-set passwords.
- **v1.2 (2026-11-10):** R3, R4, R7, R11 and R17 changed; R24 Settings, R25 Absence type management and R26 Admin range entry added.
- **v1.3 (2026-11-11):** R18 changed: an arriving notification reloads the open page's data, so requests and decisions show without a manual reload.
- **v1.4 (2026-11-11):** R25 changed: a one-click "Sichtbar" switch on each non-fixed type's row.
- **v1.5 (2026-11-11):** R27 Mobile app (PWA) and push notifications added.
- **v1.6 (2026-11-11):** R23: the invite email shows the username, the steps, and the QR code.
- **v1.7 (2026-11-17):** R23: an eye button on each password field shows or hides the password.
- **v1.8 (2026-11-17):** R7, R8, R18: the substitute is notified on approval (not on request) and on cancellation of an approved request; a sick report can name a substitute.
- **v1.9 (2026-11-23):** R1: "Angemeldet bleiben" box; the browser can save the login.
- **v1.10 (2026-11-24):** R23: the invite email attaches the employee guide as a PDF.
