# Swing Theory Booking Platform
### Unified Platform Spec — v3.3
**Last Updated:** May 2026
**Status:** Phases 1–7 complete · Prod live at `sync.swingtheory.golf` · PWA + Staff Schedule + Registry Golf integration shipped · Program enrollment gating live (v3.3)

---

## 1. Platform Overview

A unified booking and coaching platform for Swing Theory, Old Town Pasadena. Internal name: **SYNC**.

Three programs (Mini Mulligans, Summer Program / Women's Clinic, Theory AI/GSPro). Five roles (admin, swinger, instructor, parent, student). One login. One admin panel. PWA-installable on iOS and Android.

**Access points:**
- Production: `https://sync.swingtheory.golf`
- A "Book Now" button on `swingtheory.golf` links to `sync.swingtheory.golf`

**Deployed URLs:**

| Env | Frontend | Worker | DB | Branch |
|---|---|---|---|---|
| Dev | `mm-1a4.pages.dev` | `mm-api.swingtheoryla.workers.dev` | `mm-db` (id: `78b84a46-b53d-497e-abbd-1bfcdb2131ed`) | `dev` |
| Prod | `sync.swingtheory.golf` | `mm-api-prod.swingtheoryla.workers.dev` | `mm-db-prod` (id: `744079c7-bc14-4125-a530-9319c7bc4da3`) | `main` |

GitHub repo: `caseyv22/mm-swingtheory`

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Hosting | Cloudflare Pages | Connected to GitHub, auto-deploys on push to main (prod) and dev (dev env) |
| API / Logic | Cloudflare Workers (Hono.js) | Two workers: `mm-api` (dev) and `mm-api-prod` (prod) |
| Database | Cloudflare D1 (SQLite) | `mm-db` (dev), `mm-db-prod` (prod) |
| Email | Resend.com | Wired and live · domain `swingtheory.golf` verified · sender `info@swingtheory.golf` |
| Auth | Clerk.dev | Dev: `logical-roughy-21.clerk.accounts.dev` · Prod: `clerk.swingtheory.golf` (instance `ins_3D9JVejfSMJ4S8unw3QyFoAIkSR`) |
| Frontend | React + Vite | Single-page app, PWA-installable |
| Styling | Tailwind CSS | Custom config with ST brand tokens |
| Icons | lucide-react `^0.460.0` | |
| Router | Hono.js | Used in Worker for all API routing |

**Deployment workflow — NO local CLI:**
- Claude generates code → Casey commits to GitHub via browser → Cloudflare auto-deploys
- D1 schema/seed changes → Cloudflare Dashboard → D1 → Console tab
- Never use `wrangler` CLI locally

**Current dev practice:** Casey works in **prod-only** while there are no real users. Refreshes `dev` branch from `main` periodically. PRs are batched on a temp feature branch → squash-merged to main → branch deleted (single Cloudflare build runs).

---

## 3. Programs

### Program 1 — Mini Mulligans
- Who books: Parent, on behalf of their child
- Format: Group session
- Days: Tuesday, Thursday (admin-editable)
- Time: 4:00–5:00 PM (admin-editable)
- Capacity: 10 spots (admin-editable)
- Price: $169/month (handled offline)
- DB id: `prog_mm` | slug: `mini-mulligans`

### Program 2 — Summer Program / Women's Clinic
- Who books: Student (adult), for themselves
- Format: Group session
- Schedule and dates fully admin-editable per program
- Capacity: 10 spots (admin-editable)
- Price: Handled offline
- New programs of this type can be created via Admin → Programs → Create

### Program 3 — Theory AI (GSPro)
- This is NOT a separate booking flow or subdomain
- It is the GSPro CSV data tracking feature
- Two flavors:
  - **Per-student** for instructors managing their assigned students (private lessons)
  - **Personal practice log** for Swinger-role employees (their own use)
- Instructor uploads GSPro CSV per student, leaves coaching notes
- Student can view their data and notes in their account

---

## 4. User Roles

### Admin (up to 3 accounts)
- Full platform control
- Manages all programs, sessions, users, instructors, schedule
- Assigns instructors to sessions
- Manual booking and cancellation (incl. removing users from sessions)
- Check-in management
- Delete accounts, trigger password resets
- Full CRUD on staff schedule (shifts)
- Nav: Sessions → Schedule → Members → Programs → Settings

### Swinger (employee, limited admin)
- Created with role `swinger`
- Has access to: Sessions module + read-only Staff Schedule + personal Theory AI practice log + Account
- Cannot access Members, Programs, Settings, or Instructor data
- Cannot edit shifts (read-only view of everyone's shifts for coordination)
- Nav: Sessions → Schedule → Theory AI → Account
- Use case: front desk / shop employees who help check people in but aren't instructors
- Badge color: `#085041`

### Instructor (up to 6 accounts)
- Views their assigned sessions and rosters
- Views and manages their assigned students
- Uploads GSPro CSV per student, leaves coaching notes
- Can check in students on their assigned sessions
- Can manually add and remove students on their assigned sessions
- Cannot edit session capacity, cancel sessions, or change instructor assignments
- Nav: Schedule → Students → Sessions → Account

### Parent
- Books Mini Mulligans sessions for their child (one child per account)
- Admin creates their account — no self-signup
- On first login → Account page (onboarding) to enter child info
- Nav: Home → My Bookings → Account

### Student
- Books group programs for themselves (Summer Program, Women's Clinic, etc.)
- Admin creates their account — no self-signup
- Can also be assigned private lessons by an instructor
- Can view instructor notes and GSPro CSV data
- Nav: Programs → Bookings → Account

**Note:** Role is stored as `role` in the `users` table. Values: `admin` | `swinger` | `instructor` | `parent` | `student`

---

## 5. Database Schema

### `users`
```sql
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  clerk_id              TEXT UNIQUE NOT NULL,
  email                 TEXT NOT NULL UNIQUE,
  full_name             TEXT NOT NULL,
  phone                 TEXT,
  role                  TEXT NOT NULL DEFAULT 'student',  -- admin | swinger | instructor | parent | student
  status                TEXT NOT NULL DEFAULT 'active',
  must_change_password  INTEGER DEFAULT 0,                -- forces password change on next login
  created_at            TEXT DEFAULT (datetime('now'))
);
```

### `children`
Only used for Mini Mulligans. One child per parent (v1).
```sql
CREATE TABLE children (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT NOT NULL REFERENCES users(id),
  first_name    TEXT NOT NULL,
  age           INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `instructors`
Extends users table with instructor-specific profile data.
```sql
CREATE TABLE instructors (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id),
  bio           TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `programs`
```sql
CREATE TABLE programs (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  slug                   TEXT NOT NULL UNIQUE,
  description            TEXT,
  booking_type           TEXT NOT NULL DEFAULT 'group',
  booker_type            TEXT NOT NULL DEFAULT 'student',
  session_days           TEXT DEFAULT 'tuesday,thursday',
  start_time             TEXT DEFAULT '16:00',
  end_time               TEXT DEFAULT '17:00',
  default_capacity       INTEGER DEFAULT 10,
  price_display          TEXT,
  show_instructor        INTEGER DEFAULT 0,
  forward_view_weeks     INTEGER DEFAULT 2,
  forward_view_enabled   INTEGER DEFAULT 1,
  cancellation_hours     INTEGER DEFAULT 24,
  max_bookings_per_week  INTEGER DEFAULT 1,
  is_active              INTEGER DEFAULT 1,
  start_date             TEXT,                    -- ISO date · null = no start constraint
  end_date               TEXT,                    -- ISO date · null = ongoing
  default_instructor_id  TEXT REFERENCES instructors(id),  -- auto-assigns to new sessions
  created_at             TEXT DEFAULT (datetime('now')),
  updated_at             TEXT DEFAULT (datetime('now'))
);
```

### `sessions`
```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL REFERENCES programs(id),
  instructor_id TEXT REFERENCES instructors(id),       -- primary instructor
  bay           TEXT,
  date          TEXT NOT NULL,
  day_of_week   TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  capacity      INTEGER NOT NULL DEFAULT 10,
  is_cancelled  INTEGER DEFAULT 0,
  cancel_reason TEXT,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `session_instructors` (join table)
Multiple instructors can be assigned to one session.
```sql
CREATE TABLE session_instructors (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  instructor_id TEXT NOT NULL REFERENCES instructors(id),
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, instructor_id)
);
```

### `bookings`
```sql
CREATE TABLE bookings (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  child_id      TEXT REFERENCES children(id),
  status        TEXT NOT NULL DEFAULT 'confirmed',
  booked_at     TEXT DEFAULT (datetime('now')),
  cancelled_at  TEXT,
  checked_in    INTEGER DEFAULT 0,
  checked_in_at TEXT,
  UNIQUE(session_id, user_id),
  UNIQUE(session_id, child_id)
);
```

### `enrollments` (added v3.3)
Gates which group programs a parent or student can book. A user must have an active enrollment row for a given program before `POST /bookings` will accept a booking for that program. Admin/Swinger/Instructor manual booking endpoints bypass this check.

- Multi-row supported: a user can be enrolled in multiple programs simultaneously.
- `end_date` is optional. If null, enrollment is ongoing. If set, bookings for sessions on dates after `end_date` are rejected.
- `start_date` defaults to creation date. Bookings for sessions before `start_date` are rejected.
- Private lessons (instructor-assigned 1:1) are NOT gated by this table — they are gated by `student_instructors` only.

```sql
CREATE TABLE enrollments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  program_id    TEXT NOT NULL REFERENCES programs(id),
  start_date    TEXT,                                  -- ISO date · null = no lower bound
  end_date      TEXT,                                  -- ISO date · null = ongoing
  is_active     INTEGER NOT NULL DEFAULT 1,            -- soft-disable without deleting
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, program_id)
);

CREATE INDEX idx_enrollments_user      ON enrollments(user_id);
CREATE INDEX idx_enrollments_program   ON enrollments(program_id);
```

### `availability`
For instructor-assigned private lesson slots.
```sql
CREATE TABLE availability (
  id            TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES instructors(id),
  program_id    TEXT NOT NULL REFERENCES programs(id),
  bay           TEXT NOT NULL,
  date          TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  is_booked     INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `private_lessons`
Instructor-assigned 1:1 lessons. `student_id` is NULL-able for webhook-created lessons (Registry Golf) where the booking arrives before a student is assigned. `source` distinguishes manual creation vs. webhook auto-creation; `external_ref` is the upstream system's booking ID for idempotency.
```sql
CREATE TABLE private_lessons (
  id            TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES instructors(id),
  student_id    TEXT REFERENCES users(id),               -- NULL-able (webhook may not know student)
  date          TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  bay           TEXT,
  notes         TEXT,
  is_cancelled  INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'manual',          -- 'manual' | 'webhook'
  external_ref  TEXT,                                    -- e.g. Registry Golf booking UUID
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_private_lessons_external_ref
  ON private_lessons(external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX idx_private_lessons_instructor_date ON private_lessons(instructor_id, date);
CREATE INDEX idx_private_lessons_student_date    ON private_lessons(student_id, date);
```

### `lesson_notes`
Coaching notes attached to a private lesson and/or a student.
```sql
CREATE TABLE lesson_notes (
  id            TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES instructors(id),
  student_id    TEXT NOT NULL REFERENCES users(id),
  lesson_id     TEXT REFERENCES private_lessons(id),
  note          TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `gspro_uploads`
GSPro CSV uploads attached to a private lesson.
```sql
CREATE TABLE gspro_uploads (
  id            TEXT PRIMARY KEY,
  lesson_id     TEXT NOT NULL REFERENCES private_lessons(id),
  -- GSPro shot data columns (one row per shot or one row per upload, see worker code)
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `practice_sessions` (Swinger Theory AI personal practice)
Used by `swinger`-role employees to log their own practice sessions.
```sql
CREATE TABLE practice_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  date          TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

### `practice_gspro` (GSPro CSV rows attached to a practice session)
```sql
CREATE TABLE practice_gspro (
  id                  TEXT PRIMARY KEY,
  practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id),
  -- GSPro shot data columns (club, ball speed, launch angle, etc.)
  -- Schema captures the full CSV row
  created_at          TEXT DEFAULT (datetime('now'))
);
```

### `shifts` (Staff Schedule — added v3.1)
Swinger work shifts for staff scheduling. Entirely separate from sessions/bookings.
```sql
CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,           -- ISO yyyy-mm-dd
  start_time    TEXT NOT NULL,           -- HH:MM 24-hour
  end_time      TEXT NOT NULL,           -- HH:MM 24-hour
  shift_type    TEXT NOT NULL DEFAULT 'Custom',
                                          -- Morning, Mid, Day, Evening, Night, All Day, Custom
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_shifts_user_date ON shifts(user_id, date);
CREATE INDEX idx_shifts_date      ON shifts(date);
```

### `config`
Global platform settings. Single row.
```sql
CREATE TABLE config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  admin_email   TEXT DEFAULT 'info@swingtheory.golf',
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

---

## 6. Key API Routes (Worker)

### Auth
- `GET /users/me` — get current user + children + instructor record
- `PUT /users/me` — update phone
- `POST /users/child` — create or update child record for parent
- `PUT /users/me/password` — update password
- `POST /auth/forgot-password` — sends Clerk reset link via Resend

### Sessions (public/parent/student)
- `GET /programs` — list active programs (filtered to user's enrollments for parent/student roles; admin/swinger/instructor see all)
- `GET /programs/:slug/sessions` — get sessions for a program (respects forward_view_weeks; rejects if user is not enrolled and role is parent/student)
- `POST /bookings` — create a booking (rejects if user has no active enrollment for the session's program; admin/swinger/instructor manual booking endpoints bypass this check)
- `DELETE /bookings/:id` — cancel a booking (respects cancellation window)
- `GET /bookings/mine` — get current user's upcoming + past bookings
- `GET /student/lessons` — student's assigned private lessons

### Admin & Swinger (use `requireAdminOrSwinger` middleware)
- `GET /admin/sessions` — sessions for a week (`?week=YYYY-MM-DD`)
- `GET /admin/sessions/range` — sessions for a date range (`?start=&end=`)
- `POST /admin/sessions` — create one-off session
- `PUT /admin/sessions/:id` — update session (capacity, cancel, instructor)
- `GET /admin/sessions/:id/roster` — full roster for a session
- `POST /admin/sessions/:id/instructors` — add instructor to session
- `DELETE /admin/sessions/:id/instructors/:instructorId` — remove instructor from session
- `POST /admin/bookings` — manual booking (bypasses capacity + window)
- `DELETE /admin/bookings/:id` — admin/swinger removes a person from a session (sends email)
- `POST /admin/bookings/:id/checkin` — toggle check-in
- `GET /admin/members` — list all users (`?q=search&status=active`)
- `GET /admin/instructors` — list all instructors

### Admin only (use `requireAdmin` middleware)
- `POST /admin/members` — create user with temp password + send welcome email; accepts optional `program_ids: string[]` (creates enrollment rows) and optional `instructor_id` (creates `student_instructors` row) for parent/student roles
- `POST /admin/members/:id/resend-temp-password` — generate new temp password and resend
- `PUT /admin/members/:id` — update user (status, role); auto-creates `instructors` row when role becomes `instructor`
- `DELETE /admin/members/:id` — delete user from Clerk + D1; cascades through gspro_uploads, lesson_notes, private_lessons, sessions (NULL out instructor_id), session_instructors, children, student_instructors, enrollments, instructors. Returns `{ok: true}` only after verifying the users row was actually removed; returns 500 with `failed_steps` if the cascade couldn't complete.
- `POST /admin/members/:id/reset-password` — admin-triggered reset
- `GET /admin/members/:id/bookings` — full booking history for a user
- `GET /admin/members/:id/instructor-students` — students assigned to a given instructor
- `GET /admin/members/:id/assigned-instructors` — instructors assigned to a given student
- `POST /admin/members/:id/assign-instructor` — assign student↔instructor
- `DELETE /admin/members/:studentId/assign-instructor/:instrId` — unassign
- `GET /admin/members/:id/enrollments` — list enrollments for a user (joined with program name)
- `POST /admin/members/:id/enrollments` — create enrollment for a user (`{program_id, start_date?, end_date?}`); idempotent — re-activates a soft-disabled row if one exists for the same `(user_id, program_id)`
- `PUT /admin/enrollments/:enrollmentId` — update enrollment dates / `is_active` flag
- `DELETE /admin/enrollments/:enrollmentId` — soft-delete (sets `is_active = 0`); use `?hard=true` for hard delete
- `GET /admin/programs` — list all programs
- `PUT /admin/programs/:id` — update program settings (incl. `default_instructor_id`); accepts optional `existing_sessions_action: 'overwrite' | 'fill_empty_only'` for instructor-change behavior on existing sessions
- `GET /admin/programs/:id/session-instructor-stats` — count of empty future sessions and existing assignments grouped by instructor; used by frontend to know whether to show the bulk-reassign confirmation dialog
- `GET /admin/programs/:id/enrollments` — list active enrollments for a program (joined with user name + email); used for program roster view
- `POST /admin/programs` — create new program
- `POST /admin/programs/:id/generate-sessions` — backfill sessions for a program
- `POST /admin/shifts/copy-week` — copy a swinger week's shifts forward (`{source_week_start, target_week_start}`)
- `GET /admin/webhooks/registry-info` — returns the Registry Golf webhook URL with embedded secret for the admin Settings page
- `GET /admin/config` — get global config
- `PUT /admin/config` — update global config

### Webhooks (no Clerk auth — gated by URL secret)
- `POST /webhooks/registry?key=<REGISTRY_WEBHOOK_SECRET>` — Registry Golf tee-time booking webhook. Idempotent on `external_ref`. Matches coach by email (case-insensitive); silently drops events for unknown emails. Auto-creates a `private_lessons` row with `student_id=NULL, source='webhook'` for the matched instructor.

### Staff Schedule — added v3.1
- `GET /admin/shifts/swingers` — list active swingers (admin + swinger)
- `GET /admin/shifts/range?start=&end=` — list shifts in date range, joined with names (admin + swinger)
- `POST /admin/shifts` — create a shift (admin only)
- `PUT /admin/shifts/:id` — update a shift (admin only)
- `DELETE /admin/shifts/:id` — delete a shift (admin only)
- `GET /admin/shifts/metrics?start=&end=` — aggregated hours/shifts/Sat/Sun per swinger (admin + swinger)

### Instructor (use `requireInstructor` middleware)
- `GET /instructor/sessions` — sessions assigned to this instructor (legacy, private lessons)
- `GET /instructor/sessions/:id/roster` — roster for an assigned session
- `GET /instructor/program-sessions` — group-program sessions assigned to this instructor
- `GET /instructor/program-sessions/:id/roster` — full roster
- `POST /instructor/program-sessions/:id/bookings` — manually add a person to session
- `POST /instructor/bookings/:bookingId/checkin` — toggle check-in
- `DELETE /instructor/bookings/:bookingId` — remove a person from session (sends email)
- `GET /instructor/searchable-members` — member search for the manual-add modal
- `GET /instructor/students` — students assigned to this instructor
- `GET /instructor/students/:id/sessions` — sessions for a specific student
- `GET /instructor/students/:id/notes` — coaching notes for a specific student
- `POST /instructor/students/:id/notes` — save coaching notes
- `GET /instructor/students/:id/lessons` — lessons for a student
- `POST /instructor/students/:id/lessons` — create a lesson
- `GET /instructor/lessons` — all lessons for this instructor
- `PUT /instructor/lessons/:id` — update lesson
- `DELETE /instructor/lessons/:id` — delete lesson
- `POST /instructor/lessons/:id/gspro` — upload GSPro CSV for a lesson
- `GET /lessons/:id/gspro` — fetch GSPro data for a lesson (any authed user)

### Swinger (use `requireSwinger` middleware)
- `GET /swinger/practice` — list this user's practice sessions
- `POST /swinger/practice` — create practice session
- `GET /swinger/practice/:id` — get one practice session
- `PUT /swinger/practice/:id` — update notes
- `DELETE /swinger/practice/:id` — delete practice session
- `POST /swinger/practice/:id/gspro` — upload GSPro CSV
- `DELETE /swinger/practice/:id/gspro` — clear GSPro data

### Crons
- `0 15 * * SUN` — generate sessions for upcoming weeks
- `0 15 * * *` — send 24hr reminder emails

---

## 7. Frontend File Structure

```
frontend/src/
├── components/
│   ├── AdminLayout.jsx        — Admin/Swinger left sidebar (role-aware, uses RoleProvider context)
│   ├── BottomNav.jsx          — PWA bottom tab bar (per-role tabs, hides when keyboard open)
│   ├── Logo.jsx               — Swing Theory wordmark
│   ├── NavBar.jsx             — Mobile-web top nav (returns null in PWA mode)
│   ├── PWAShell.jsx           — Layout component renders persistent BottomNav for PWA
│   ├── ScheduleGrid.jsx       — Shared shift grid (Weekly/Monthly/Weekends views) — admin + swinger
│   ├── ShiftModal.jsx         — Admin-only add/edit/delete shift modal
│   ├── TheoryAI.jsx           — Reusable Theory AI viewer/editor (used by instructor + swinger)
│   └── TypeaheadSelect.jsx    — Member/student search dropdown
├── lib/
│   ├── api.js                 — fetch wrapper, all API calls (token-based + admin shorthand methods)
│   ├── RoleProvider.jsx       — App-level role context; resolves /users/me once, exposes useRole()
│   ├── useKeyboardOpen.js     — visualViewport-based keyboard detection (hides BottomNav when typing)
│   └── usePWAMode.js          — display-mode media query + iOS standalone detection
├── pages/
│   ├── ProgramSelector.jsx    — Student program selector (dynamic schedule, forward booking)
│   ├── admin/
│   │   ├── AdminSessions.jsx  — UNIFIED: metrics + week + roster + calendar + recent members (mobile-friendly)
│   │   ├── AdminSchedule.jsx  — Staff schedule (Weekly/Monthly/Weekends + Metrics tab); role-aware
│   │   ├── AdminMembers.jsx   — Member table, detail panel, add member modal
│   │   ├── AdminPrograms.jsx  — Program cards, expandable settings editor (incl. Default Instructor)
│   │   └── AdminSettings.jsx  — Admin email config, platform info
│   ├── parent/
│   │   ├── ParentHome.jsx     — Landing: welcome, next session, programs
│   │   ├── CalendarPage.jsx   — Month calendar, session detail, book/cancel
│   │   ├── MyBookingsPage.jsx — Upcoming + history
│   │   └── AccountPage.jsx    — UNIFIED role-aware account page (incl. force change password mode)
│   ├── instructor/
│   │   ├── InstructorSessions.jsx       — Group programs assigned (filter pills, roster, manual add/remove, check-in)
│   │   ├── InstructorSchedule.jsx       — Private lesson calendar (no auto-collapse)
│   │   ├── InstructorLessonDetail.jsx   — Single lesson view
│   │   ├── InstructorStudents.jsx       — Assigned students list
│   │   └── InstructorStudentProfile.jsx — Per-student notes + GSPro CSV
│   └── swinger/
│       └── SwingerTheoryAI.jsx — Personal practice log (date dropdown, notes, GSPro CSV)
├── App.jsx                    — Routes wrapped in RoleProvider+PWAShell layout · LoginPage outside
├── main.jsx
└── index.css                  — Tailwind + html.pwa-mode safe-area padding rules
```

**Persistent layout pattern (added v3.1):**
- `RoleProvider` resolves the user's role once via `/users/me` and stores it in context (with `sessionStorage` cache for instant first paint).
- `PWAShell` is a layout route element that wraps protected routes — renders `<Outlet />` plus a persistent `<BottomNav role={role} />` when in PWA mode for parent/student/instructor/swinger.
- Routes that should NEVER show BottomNav (login, forced password change) live outside this layout or are suppressed via search-param check inside PWAShell.
- This eliminates the BottomNav-flickering bug from when nav was rendered inside each page.

---

## 8. Routing

| Path | Component | Role |
|---|---|---|
| `/login` | LoginPage | Public |
| `/home` | ParentHome or RoleRouter redirect | All |
| `/programs` | ProgramSelector | Student, Parent |
| `/book/:slug` | CalendarPage | Parent, Student |
| `/my-bookings` | MyBookingsPage | Parent, Student |
| `/account` | AccountPage | All |
| `/account?onboarding=true` | AccountPage (onboarding mode) | New parents |
| `/account?change-password=true` | AccountPage (forced change) | First login w/ temp password |
| `/admin` | AdminSessions | Admin, Swinger |
| `/admin/schedule` | AdminSchedule | Admin (full CRUD), Swinger (read-only) |
| `/admin/members` | AdminMembers | Admin |
| `/admin/programs` | AdminPrograms | Admin |
| `/admin/settings` | AdminSettings | Admin |
| `/theory-ai` | SwingerTheoryAI | Swinger, Admin |
| `/instructor/sessions` | InstructorSessions | Instructor, Admin |
| `/instructor/students` | InstructorStudents | Instructor, Admin |
| `/instructor/students/:studentId` | InstructorStudentProfile | Instructor, Admin |
| `/instructor/schedule` | InstructorSchedule | Instructor, Admin |
| `/instructor/lessons/:lessonId` | InstructorLessonDetail | Instructor, Admin |

**RoleRouter logic (on `/home`):**
- `parent` + first login + no child → `/account?onboarding=true`
- `parent` → `/home` (ParentHome)
- `student` → `/programs`
- `instructor` → `/instructor/schedule`
- `swinger` → `/admin` (Sessions module)
- `admin` → `/admin`
- Any role with `must_change_password=1` → `/account?change-password=true`

---

## 9. PWA Behavior (added v3.1)

The app is installable as a PWA on iOS and Android. Manifest at `/manifest.json` registers it as "Swing Sync".

**Detection:**
- `usePWAMode()` watches `display-mode: standalone` media query plus iOS `navigator.standalone` flag.
- Toggles `pwa-mode` class on `<html>` for global CSS adjustments (safe-area padding).

**Per-role bottom nav (PWA only):**
| Role | Tabs |
|---|---|
| Parent | Home / Bookings / Account |
| Student | Programs / Bookings / Account |
| Instructor | Schedule / Students / Sessions / Account |
| Swinger | Sessions / Schedule / Theory AI / Account |
| Admin | (no bottom nav — sidebar persists in PWA too) |

**Keyboard handling:**
- `useKeyboardOpen()` uses `visualViewport` API plus focus events to detect on-screen keyboard.
- `BottomNav` returns `null` while keyboard is open — prevents typing UI being covered.

**Status bar:**
- iOS uses `apple-mobile-web-app-status-bar-style="black-translucent"` which overlays content.
- `index.css` adds top safe-area padding to `<body>` when `html.pwa-mode` is set.

**Install hint:**
- After PWA refactors, users sometimes need to delete and re-add the home screen icon to bypass aggressive PWA cache.

---

## 10. Account Creation Flow (Temp Password Approach)

Admin creates all accounts — there is no self-signup. Replaced the original Clerk invitation flow with a temp password flow because Clerk's invitation emails were unreliable.

1. Admin goes to Members → Add Member
2. Fills in: full name, email, role, phone, child info (if parent)
3. **(For parent/student roles)** Optionally selects program(s) to enroll the user in; **(for student role only)** optionally selects an instructor to assign
4. Worker generates a temp password (e.g. `swing-7429`)
5. Worker creates user in Clerk with that temp password
6. Worker creates user in D1 with `must_change_password=1`
7. Worker creates `enrollments` row(s) for any selected programs (parent/student)
8. Worker creates `student_instructors` row if instructor was selected (student only)
9. Worker sends welcome email via Resend with: email, temp password, login link
10. User logs in → forced password change UI at `/account?change-password=true`
11. After change, `must_change_password` flips to 0

**No-program warning:** The Add Member form shows an inline warning when role = parent/student and no program is selected — the user can still be created, but won't be able to book anything until an enrollment is added from their member profile.

**Editing enrollments later:** The Member detail view in Admin → Members has an Enrollments section where admin can add/remove program enrollments and adjust dates after account creation.

**Forgot password flow:** Self-service via `/auth/forgot-password` → Clerk reset link emailed via Resend.

---

## 11. Staff Schedule (added v3.1)

A new feature for managing swinger work shifts. Entirely separate from the customer-facing sessions/programs/bookings system.

**Roles:**
- Admin: full CRUD on all shifts via shift modal
- Swinger: read-only view of all shifts for coordination

**Route:** `/admin/schedule` (both roles use the same route; admin gets edit affordances based on role from `RoleProvider`)

**Page structure:** Two top tabs (Schedule | Metrics).
- Schedule tab → 3 sub-views (Weekly / Monthly / Weekends) + date nav + shift grid
- Metrics tab → date range filter + employee filter + summary cards (Total Hours / Shifts / Saturdays / Sundays) + per-employee metric cards with shift-type breakdown pills

**Shift presets:**
| Preset | Times | Hours |
|---|---|---|
| Morning | 10:00–15:00 | 5 |
| Mid | 13:00–17:00 | 4 |
| Day | 10:00–17:00 | 7 |
| Evening | 15:00–20:00 | 5 |
| Night | 17:00–20:00 | 3 |
| All Day | 10:00–20:00 | 10 |
| Custom | user-defined | varies |

**Visual:** All shift chips use brand green `#064029` — no per-employee colors per design decision.

**Date safety:** All dates stored and rendered as strings. Date objects constructed with `'T12:00:00'` suffix to avoid UTC shift edge cases.

**Deferred to v2 (Schedule):** drag-to-reorder, copy-last-week, clear-this-week, per-employee colors, print view, custom locations, hours-by-week breakdown on metrics cards.

---

## 12. UI & Design

### Brand Tokens
- **Primary green:** `#064029`
- **Hover green:** `#085041` (also Swinger badge color)
- **Accent green:** `#1D9E75`
- **Light green surface:** `#E1F5EE`
- **Display font:** Bebas Neue (headings, page titles, stats)
- **Body font:** Manrope (all body copy, labels, form fields, tables)
- Clean, modern, premium — not a generic booking widget

### Tailwind Config
```js
colors: {
  'st-green': '#064029',
  'st-accent': '#1D9E75',
  'st-light': '#E1F5EE',
  'st-phantom': '#0A0A0A',
  'st-graphite': '#6B7280',
  'st-cloud': '#E5E7EB',
  'st-smoke': '#D1D5DB',
  'st-offwhite': '#F9FAFB',
}
fontFamily: {
  sans: ['Manrope', 'sans-serif'],
  display: ['Bebas Neue', 'sans-serif'],
}
```

### Layout Patterns
- **Admin (always):** Left sidebar (fixed, 224px) with hamburger on mobile — `AdminLayout.jsx` (role-aware nav). Persists in both web and PWA contexts for admin.
- **Swinger (web):** Same `AdminLayout.jsx` left sidebar.
- **Swinger (PWA):** `AdminLayout` returns just `<main>{children}</main>`; persistent `BottomNav` rendered by `PWAShell` at App-level.
- **Parent/Student/Instructor (web):** Top nav with hamburger on mobile — `NavBar.jsx`.
- **Parent/Student/Instructor (PWA):** `NavBar` returns `null`; persistent `BottomNav` rendered by `PWAShell`.
- **Mobile-first** — all tap targets minimum 44px.
- **AdminSessions mobile order:** Calendar (collapsible) → Sessions list → Roster (when selected). Desktop keeps the 3-panel side-by-side layout.
- **Mobile breakpoints:** PWA hides metric cards (`hidden md:grid`); iPad portrait+ shows them.
- **Calendar week:** Sun-Sat (changed from Mon-Sun).
- **Date/time inputs:** Use native `<select>` with predefined options (TIME_OPTIONS 6AM–9:30PM in 30-min increments; DATE_OPTIONS 365 days). Avoids native picker UX issues on mobile/PWA.

### Text Color Convention
After Phase 7 readability pass:
- `text-gray-300` — never use; minimum is gray-400
- `text-gray-400` — italic placeholders, disabled states
- `text-gray-500` — subtitles, captions, "of N spots", "this week"
- `text-gray-600` — body subtitle, inactive pills
- `text-gray-700` — body text, labels
- `text-gray-900` — headings, primary text

### Browser Page Titles
Format: `${PageName} | Sync | Swing Theory`
- Login → `Sign In | Sync | Swing Theory`
- Home → `Home | Sync | Swing Theory`
- Admin Sessions → `Sessions | Sync | Swing Theory`
- Admin Schedule → `Schedule | Sync | Swing Theory`
- (etc — see implementations in `AdminLayout`, `NavBar`, `App.jsx`)

---

## 13. Business Rules

All enforced at the Worker API level. UI reflects but does not solely rely on them.

| Rule | Detail | Configurable |
|---|---|---|
| Max bookings per week | Per user per program per Sun–Sat week | Yes, per program |
| Session capacity | Bookings rejected if at capacity | Yes, per session |
| No double booking | UNIQUE constraint on session + user | No |
| Cancellation window | Can cancel if > N hours before session | Yes, per program |
| Active users only | Inactive accounts cannot book | No |
| Past sessions read-only | Cannot book or cancel past sessions | No |
| Program enrollment required | Parent/student must have active enrollment for the program before booking; session date must fall within enrollment's `start_date`/`end_date` window if set | Yes, per user (admin manages enrollments) |
| Admin/Swinger bypass | Capacity, window, weekly limits, enrollment | No |
| Instructor bypass | Capacity, enrollment (when manually adding to assigned sessions) | No |
| Child uniqueness | One booking per child per session | No |
| Forward booking | Students can book future-start programs as soon as sessions exist | Yes, per program |
| Shift validation | end_time > start_time, shift_type in enum, user must be active swinger | No |
| Role promotion to instructor | Auto-creates `instructors` row if missing; idempotent | No |
| Member delete cascade | Removes gspro_uploads + lesson_notes by lesson_id, then bookings/lessons/enrollments/etc.; nulls `sessions.instructor_id`; verifies `users` row deleted before reporting success | No |
| Default instructor backfill | Setting/changing default fills empty future non-cancelled sessions; clearing to None clears all; conflicting reassignments require frontend confirmation | No |
| Webhook idempotency | `private_lessons.external_ref` unique-partial-indexed; duplicate Registry Golf retries are no-ops | No |
| Enrollment uniqueness | UNIQUE on `(user_id, program_id)`; re-enrolling reactivates the existing row rather than creating a duplicate | No |

---

## 14. Email Flows (Resend, live)

All via Resend. Sender: `info@swingtheory.golf`. Domain `swingtheory.golf` is verified.

| Trigger | Recipient | Subject |
|---|---|---|
| Account created (temp password) | User | Welcome to Swing Theory — Your login info |
| Forgot password | User | Reset your Swing Theory password |
| Booking confirmed | Parent/Student | You're booked — [Program] [Date] |
| Booking cancelled by user | Parent/Student | Booking cancelled — [Date] |
| Booking removed by admin/instructor | User | Your booking has been cancelled |
| Session cancelled by admin | All booked users | Session Cancelled — [Date] |
| 24hrs before session | All booked users | See you tomorrow — [Date] |

---

## 15. Build Status

### Done ✓
- **Phase 1:** Foundation — D1, Worker, Crons, Clerk auth, Pages deployment
- **Phase 2:** Parent flow — Home, Calendar, Book, Cancel, My Bookings, Account
- **Phase 3:** Group programs — works with same calendar flow
- **Phase 4:** Admin panel — Sessions (unified), Members, Programs, Settings
- **Phase 5:** Instructor panel — Sessions, Students, Schedule, GSPro CSV upload, coaching notes
- **Phase 5:** Student private lesson view — assigned sessions + instructor notes
- **Phase 5:** Admin loose ends — delete account, password reset, create program, instructor assignment, default instructor on programs
- **Phase 6:** Email — Resend DNS verified, all email templates wired, 24hr reminder cron
- **Phase 7:** Custom domain `sync.swingtheory.golf` connected and live
- **Phase 7:** Member invitation flow (temp password approach)
- **Phase 7:** Swinger role for limited-admin employees
- **Phase 7:** Mobile/PWA-friendly Sessions UI
- **Phase 7:** Sun-Sat week alignment
- **Phase 7:** Page title format normalization
- **Phase 7:** Forward booking for future-start programs
- **Phase 7:** Admin/Instructor remove people from sessions
- **Phase 7:** Default instructor per program (auto-assigns to new sessions)
- **Phase 7:** Global gray text darkening for readability
- **v3.1:** PWA installation + bottom nav per role
- **v3.1:** Persistent layout refactor (RoleProvider + PWAShell, eliminates BottomNav flicker)
- **v3.1:** Keyboard-open detection (BottomNav hides when typing)
- **v3.1:** Staff Schedule (admin CRUD + swinger read-only, Weekly/Monthly/Weekends + Metrics)
- **v3.2:** Swinger Schedule personal redesign (Day/Week/Month, mobile-first); admin-only Metrics
- **v3.2:** Admin Schedule polish — brand-green weekend palette, Clean View toggle (sessionStorage-persisted), Copy from Last Week, time-range labels on chips
- **v3.2:** Registry Golf webhook integration end-to-end — `POST /webhooks/registry`, idempotent on `external_ref`, instructor-matched by email; admin Settings card surfaces the webhook URL
- **v3.2:** Instructor unassigned-lesson UX — amber "Unassigned" + green "Tee Time" badges; instructor can assign a student from the lesson detail page
- **v3.2:** Instructors row auto-creation on role change (admin → role=instructor) via `PUT /admin/members/:id`
- **v3.2:** Member delete cascade fix — handles `gspro_uploads.lesson_id` and `lesson_notes.lesson_id` blockers; nulls `sessions.instructor_id` instead of attempting cascade-delete; verifies `users` row is actually gone before reporting success
- **v3.2:** Program Default Instructor on Create modal (was edit-only)
- **v3.2:** Program Default Instructor backfill — fills empty future sessions silently; clearing to None unconditionally clears all future non-cancelled sessions
- **v3.2:** Program Default Instructor bulk reassign — confirmation dialog when changing to a different instructor with conflicts ("Replace on all N" / "Only fill X empty" / Cancel)
- **v3.3:** Program enrollment gating — `enrollments` table + admin Add Member program/instructor selectors + Member profile Enrollments section (add/edit/deactivate/reactivate with branded modals) + Members list "No program assigned" indicator + booking gate on `POST /bookings`, `GET /programs`, `GET /programs/:slug/sessions` (gated behind `ENROLLMENT_ENFORCEMENT` env var, deployed dark, then enabled). Cascade updated to remove enrollments on member delete. Improved empty state on ProgramSelector for unenrolled users.
- **v3.3:** AdminMembers stale-form bugfix — `MemberDetail` now resets `form` and transient UI flags in the `useEffect` keyed on `member.id`, fixing a bug where switching between members in the left list left the previously-selected member's data in the edit form (would have silently overwritten the wrong record on Save).
- **v3.3:** Instructor nav reorder — Schedule → Students → Sessions → Account (was Sessions → Students → Schedule → Account); post-login landing changed from `/instructor/sessions` to `/instructor/schedule`. Updated in `NavBar.jsx`, `BottomNav.jsx`, and the RoleRouter in `App.jsx`. NavBar label "Calendar" renamed to "Schedule" to match the page title.

### In Progress / Polish
- Mobile QA across all roles and flows
- Edge case error states
- Iconography pass (consistent lucide-react usage)

### Not Started (v2 candidates)
- Square / Stripe payment integration
- Tournament module
- Waitlist
- Multi-child per parent
- Multi-location support
- Schedule v2 conveniences (drag-to-reorder, copy-last-week, clear-this-week, per-employee colors)

---

## 16. Key Decisions

| # | Decision |
|---|---|
| 1 | No self-signup — admin creates all accounts |
| 2 | Account creation uses temp password + forced change (not Clerk invitation) |
| 3 | Role naming: `student` (not `member`); added `swinger` for limited-admin employees |
| 4 | Theory AI = GSPro CSV upload feature (not a separate subdomain); has both per-student (instructor) and personal (swinger) variants |
| 5 | Admin Sessions page = unified: metrics + week cards + roster + calendar + recent members |
| 6 | Account page is role-aware: parent sees child fields, instructor sees bio, etc. |
| 7 | First-login onboarding uses `?onboarding=true` param on AccountPage |
| 8 | Forced password change uses `?change-password=true` param on AccountPage |
| 9 | Payment handled offline — no Stripe in v1 |
| 10 | Subdomain: `sync.swingtheory.golf` (live in prod) |
| 11 | Admin notification email: `info@swingtheory.golf` |
| 12 | Cancellation window: per-program, default 24 hours |
| 13 | Forward view: per-program, default 2 weeks; future-start programs ARE bookable |
| 14 | Body font: Manrope, Display font: Bebas Neue |
| 15 | Primary green: `#064029` |
| 16 | Calendar week: Sun-Sat |
| 17 | Default instructor per program: setting one fills empty future sessions; clearing to None clears all future non-cancelled sessions; changing to a different instructor with conflicts prompts a confirmation dialog (overwrite all / fill empty only / cancel) |
| 18 | Date/time pickers use predefined select dropdowns (not native pickers) |
| 19 | Page title format: `${PageName} | Sync | Swing Theory` |
| 20 | Session-level multi-instructor support via `session_instructors` join table |
| 21 | Instructor permissions: view + check-in + manual add + manual remove on assigned sessions |
| 22 | Instructors cannot edit capacity, cancel sessions, or change instructor assignments |
| 23 | Casey works in prod-only while there are no real users; refreshes dev from main periodically |
| 24 | Workflow: temp branch → batch commit → squash-merge to main → delete branch (single Cloudflare build) |
| 25 | App is installable as PWA on iOS and Android; bottom nav for non-admin roles in PWA mode only |
| 26 | Admin role keeps left sidebar in both web and PWA contexts (no bottom nav for admin) |
| 27 | Persistent layout via App-level `RoleProvider` + `PWAShell` — single nav element across navigation |
| 28 | Staff Schedule: brand-green chips, no per-employee colors; 6 named presets + Custom; Weekly/Monthly/Weekends sub-views |
| 29 | Schedulable employees in Staff Schedule = users with `role='swinger'`; admin CRUD, swinger read-only |
| 30 | Registry Golf webhook auth via URL token (`?key=`), not HMAC (Registry Golf doesn't support signed webhooks); secret stored as `REGISTRY_WEBHOOK_SECRET` Cloudflare Worker secret |
| 31 | Webhook source tagging via `private_lessons.source` (`'manual'` \| `'webhook'`); idempotency via unique partial index on `external_ref`; email-mismatched webhooks silently dropped |
| 32 | Promoting a user to `role='instructor'` via admin auto-creates the corresponding `instructors` row; demoting leaves the orphan row in place to preserve referenced data (private lessons, sessions) |
| 33 | Member delete returns 500 with `failed_steps` array if the cascade can't complete and the `users` row still exists; no more silent success when deletes are blocked by FK constraints |
| 34 | Registry webhook does NOT email the matched instructor — discovery is in-app via the amber "Unassigned" badge on the lesson detail page (avoids notification overload) |
| 35 | Instructor nav order: Schedule → Students → Sessions → Account; post-login lands on `/instructor/schedule` (Schedule first because instructors live in their lesson calendar day-to-day) |

---

## 17. Out of Scope (v1)

| Feature | Notes |
|---|---|
| Payment processing | Stripe / Square is v2 |
| Waitlist | No queue management in v1 |
| Video uploads | v2 |
| Native iOS/Android app | Web is fully mobile-optimized; PWA support |
| Multi-location support | v2 |
| Recurring auto-payments | v2 |
| Multi-child per parent | v2 |
| Tournament module | v2 |
| Schedule v2 conveniences | drag-to-reorder, copy-last-week, clear-this-week, per-employee colors, print view, custom locations |

---

*This is the live source of truth for the Swing Theory / SYNC platform. Update this document when scope changes.*
