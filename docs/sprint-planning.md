# Sprint duration and automatic dates

Sprints support 3, 7, or 14 calendar days (14 is the default).
Dates are inclusive: end = start + duration - 1. Consecutive sprints start
on the day after the previous sprint ends.

New project:
- Choose the first sprint start date and number of sprints (1–52).
- Choose one duration at the top; it applies to every sprint.
- Preview every sprint's dates; the project planned end is calculated from the
  final sprint and is read-only.

Existing project, Board:
- Use Sprint to add a consecutive batch with count, duration, and start date.
- Use Edit sprint for the selected sprint to change its name, start, or duration.
- The end date is read-only and recalculates immediately.
- In Edit project, the planned start can be edited. When the start or sprint
  durations change, the planned end is calculated from that start and the
  sum of the sprint durations. Existing sprint dates are not moved automatically.

API and MCP:
- Project sprint inputs accept duration_days (3/7/14), with calculated end_date.
- Single sprint creation/editing supports duration_days; edits cannot override
  the derived end date. Legacy create clients may include a matching end date.
- POST /projects/{id}/sprints/batch atomically creates 1–52 sprints, using
  start_date, duration_days, count, and a name/prefix.
- Duration is derived from persisted start/end dates; no data migration is needed.

Initial scheduling implementation verification:
- 46 frontend tests and TypeScript passed.
- 34 targeted backend tests passed, including real PostgreSQL mixed-plan,
  batch creation, sprint edits, readonly-end rejection, and MCP regressions.
- Production frontend/API builds and strict translation audit passed.
- Browser verified count/duration changes, individual overrides, calculated
  dates, and readonly end fields in New project and existing-project sprint forms.
- Browser test changes were discarded; no existing sprint was modified.
- Changes run locally. Production was not deployed.


Updated project-creation form verification: build, TypeScript, and strict translation audit passed.

Project creation uses one Sprint duration selector at the top. Every sprint row
uses that duration, with no individual duration overrides. Changing the count or
removing a sprint preserves the shared duration and recalculates all dates.
