 compare the current app features and our plan and the other famous used app if we miss some features and any suggestion

Comparing the current app, our plan, and widely used German leave tools (Personio, absence.io, Factorial, Papershift, TimeTac), the plan covers everything the current app does except Print and two small grid details. The main gaps are features the commercial tools have, and a few of those matter legally in Germany.

1. Current app vs. our plan

┌──────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│              Current PraxisPlan feature              │                           In plan?                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Grid: employees × Mon–Fri, month filter, name search │ ✅                                                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Categories Arbeiter / Ärzte / Verwaltung             │ ✅                                                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Click cycle X → U → empty                            │ ✅                                                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Sick and vacation counts per row                     │ ✅ (plus remaining days)                                     │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Holidays red, today highlighted                      │ ✅                                                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Day notes (orange dot, right-click)                  │ ✅                                                           │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Add or remove a name                                 │ ✅ (delete only allowed when the employee has no entries)    │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Excel, Download/Import                               │ ✅ (export, JSON backup, one-time import)                    │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Save with Ctrl+S                                     │ ✅ No longer needed, because every click saves automatically │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Clicking a number lists those absences               │ ⚠️ Missing. Easy to add as a popover.                        │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Yellow line at month start, blue line after Friday   │ ⚠️ Missing. Easy to add as styling.                          │
├──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Print                                                │ ❌ You dropped it earlier                                    │
└──────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘

2. What the commercial tools have that we're missing

Legally or factually important in Germany (my strong recommendation):
1. Part-time work patterns. Medical centers have many part-time staff (e.g. a nurse working Mon/Tue/Thu). Leave days must be counted against their working days, and their allowance is lower. Without this, every part-timer's balance is wrong. This is the most important gap.
2. Pro-rata allowance for people who join or leave mid-year (§5 BUrlG), suggested automatically from the start and end date.
3. Carry-over expiry on 31.3., plus a reminder email to employees with unused days. Since BAG 2019 the employer has to warn employees that their days will expire, otherwise the days don't expire. absence.io and Personio automate this warning.
4. Health data protection (DSGVO Art. 9). Sick days are health data. That means:
   - EU hosting.
   - Colleagues never see "sick", only "abwesend".
   - An audit log of who changed what.
   - Deletion after a retention period, e.g. 3 years.

Useful for a medical practice:
- Closure days (Betriebsurlaub / Praxisschließung), e.g. 24.12. to 1.1. The admin enters them once, and they are deducted from everyone automatically.
- More absence types: Fortbildung, Sonderurlaub (wedding, bereavement), Kind krank, Überstundenabbau. Sick and vacation alone force workarounds.
- AU certificate tracking: a checkbox for "AU liegt vor" (or eAU retrieved), with a warning from sick day 4 if it's missing.
- Team calendar for employees that shows only "abwesend". Employees can see before requesting that two doctors are already off. absence.io's experience is that this prevents most conflicts.
- Blackout periods (Urlaubssperre), e.g. during flu season or quarter-end billing, so requests are blocked or warned.
- Substitute (Vertretung) chosen on the request; common for doctors.

Nice to have:
- Half days.
- A calendar subscription (iCal) for Outlook or phones.
- Installing it on phones like an app (PWA).
- Monthly sick-rate statistics.
