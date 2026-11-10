# PRD — MVZ El-Sharafi: Anwesenheit & Urlaub
**Version:** 1.2 · **Date:** 2026-11-10 · **Status:** Draft, awaiting approval · **Owner:** MVZ El-Sharafi practice management

| Document | Contents |
|---|---|
| [requirements.md](requirements.md) | Detailed requirements R1–R26 with acceptance criteria |
| [design.md](design.md) | Architecture, data model, code style, testing, commands, boundaries |
| [tasks.md](tasks.md) | Task breakdown T0–T20 and progress |

## 1. Problem
Attendance is kept in `PraxisPlan V2.1.html`, a single file on one practice PC.
- Only someone at that PC can see or change it.
- Employees can't request leave themselves, and nothing gets approved or notified.
- Part-time work, carry-over expiry and pro-rata allowances are calculated by hand.
- Sick days (health data) aren't protected, and the only backup is a manually saved file.

## 2. Goal
One online app where:
- **Admins** keep the familiar grid and one-click entry, and approve requests with team conflicts in view.
- **Employees** request leave, report sick, and see their balance and their team's absences.
- **German leave law and DSGVO** are applied automatically.

## 3. Users
| User | Count | Needs |
|---|---|---|
| Admin (practice management) | 1–3 | Overview of everyone, fast sick entry, approvals, staff and allowance management, Excel for payroll |
| Ärzte | part of ~45 | Request vacation and training, see colleague overlap, choose a substitute |
| Arbeiter (nurses, practice staff) | part of ~45 | Same as Ärzte. Many are part-time; mostly use a phone. |
| Verwaltung | part of ~45 | Same as Ärzte |

## 4. Scope — features
| Area | Features | Req |
|---|---|---|
| Access | Username login, invite link (email or QR) to set your own password, Passwort vergessen, activate/deactivate | R1, R19, R23 |
| Admin grid | The familiar month grid: click cycle X → U → empty, right-click menu, notes, counts with drill-down, holiday/today/month/week markers | R2 |
| Absence types | Admin-managed list (add, rename, letter/colour, show/hide). Starts with Urlaub, Betriebsurlaub, Krank, Kind krank, Fortbildung, Bildungsurlaub, Sonderurlaub (Hochzeit, Geburt, Todesfall, Umzug, sonstige), Überstundenabbau, Unbezahlter Urlaub, Elternzeit, Mutterschutz. Optional limits per type; half days; admin range entry for long periods. | R3, R4, R25, R26 |
| Correct counting | Part-time weekdays, Berlin holidays, closure days | R5, R6, R16 |
| Requests | Request with substitute → pending → approve/deny/cancel; direct sick report | R7–R9 |
| Team awareness | Same-category conflicts, staffing limit per category, team calendar showing only "abwesend" | R10, R11 |
| Balances & law | Balances, pro-rata allowance (§5 BUrlG), carry-over expiry 31.3., reminders (BAG employer notice) with log, AU tracking (§5 EFZG) | R12–R15, R17 |
| Notifications | Live bell + SMTP email | R18 |
| Privacy | Audit log, 3-year deletion of health data, sick details visible to admins only | R20 |
| Data | Excel export, JSON backup, one-time import of 2026 from PraxisPlan | R21, R22 |
| Settings | Admin page "Einstellungen" with on/off switches for team calendar, half days, substitute, AU tracking | R24 |

## 4a. First login & forgotten password
1. The admin creates the employee (name, username, optional email, team, …).
2. The admin clicks **"Einladung erstellen"**, which makes a one-time link valid for 7 days:
   - **Employee has an email:** the link is emailed automatically.
   - **No email:** the screen shows the link plus a QR code to print, scan from the admin's screen, or forward on WhatsApp.
3. The employee opens the link and sets their own password (at least 10 characters, entered twice). They are then logged in, and the link stops working.
4. From then on they log in with **username + password**. The admin never sets or sees a password.
5. **Forgotten password:**
   - **With an email:** a self-service "Passwort vergessen" link.
   - **Without an email:** the admin makes a new link (same "Einladung erstellen" button).

## 4b. Settings (show/hide features)
The admin can switch these on or off for the whole practice on the **Einstellungen** page:

| Switch | When off |
|---|---|
| Team calendar | Employees no longer see colleagues' absences. Admins still see everything. |
| Half days | No ½-day option in requests or the grid. Existing half days stay as they are. |
| Substitute (Vertretung) | The substitute field is hidden and not saved |
| AU tracking | No "AU liegt vor" option, no warnings or red marks. The stored AU flags stay. |

Absence types are shown or hidden one by one on the same page. A hidden type disappears from forms and menus, but past entries stay visible and keep counting.

## 5. Success metrics
- **Day 1:** the old HTML file is retired, and imported 2026 totals match it for every employee.
- **Month 1:** ≥ 80% of vacation requests are made in the app rather than verbally.
- **Ongoing:** 0 balance errors reported because of part-time work, holidays or carry-over. Every expiry reminder is logged.
- **Quality:** every requirement is covered by an automated test, and an employee can never see a colleague's absence type.

## 6. Constraints
- Supabase project `jvmehkgacwozfmuyiuyo` (EU region and DPA still to confirm).
- Practice SMTP mailbox for email.
- German UI only. Berlin holidays.
- Everything ships at once (no phased rollout).

## 7. Not doing
Print view, blackout periods, a second language, approval for sick days, rotating or shift schedules, hourly absences, time tracking, shift planning, payroll integration, eAU retrieval, iCal, PWA, statistics, live grid sync, WhatsApp/SMS, a SmartQ link, two-factor login (not wanted; revisit if admin accounts are ever compromised). Reasons are in `requirements.md` §4.

## 8. Risks
| Risk | Mitigation |
|---|---|
| The old file's format can't be parsed | Inspect the file before writing the importer (T19); fall back to the Excel export |
| Admins keep using the old file | The grid copies the old interactions exactly; retire the file on the day of import |
| Wrong legal rules | Rules live in SQL with pgTAP tests per rule; changing a legal rule needs approval |
| Health-data leak | Masking at the database level (`team_calendar`), RLS everywhere, a pgTAP test that proves it |

## 9. Changelog
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-10 | First PRD, from the planning sessions, the screenshots of the current app, and the competitor comparison |
| 1.1 | 2026-11-10 | First login via invite link (email/QR), self-service reset, no admin-set passwords |
| 1.2 | 2026-11-10 | Settings page with feature switches; admin-managed absence types; new types Bildungsurlaub, Sonderurlaub subtypes, Unbezahlter Urlaub, Elternzeit, Mutterschutz; admin range entry |

