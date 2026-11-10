# MVZ El-Sharafi — Anwesenheit & Urlaub

## Specs are the source of truth
`specs/` is the source of truth: `PRD.md` → `requirements.md` → `design.md` → `tasks.md`.

Every new feature, change request or accepted suggestion goes through the specs first:
1. `specs/PRD.md`: add it to the feature list, plus a changelog entry with a version bump.
2. `specs/requirements.md`: add the requirement and its acceptance criteria (WHEN/IF … SHALL).
3. `specs/design.md`: update it if the design changes.
4. `specs/tasks.md`: add the new tasks.

Only then is it implemented. Never build anything that isn't in the specs. Tick off tasks in `specs/tasks.md` as they're finished.

Boundaries, commands and code style are in `specs/design.md` §7, §9 and §10.
