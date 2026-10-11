# Task List App

A full-stack task manager built with **Next.js 15 (App Router)**, **TypeScript**, **Supabase** (PostgreSQL + Auth + Row Level Security), and a hand-rolled CSV import pipeline.

> **Screen recording:** <!-- add Loom / YouTube link here -->

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, Server Components |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email + password) |
| Styling | Plain CSS (no framework) |
| Tests | Jest + ts-jest |

---

## Prerequisites

- **Node.js 18 or later**
- A **Supabase** project (free tier works fine)
  - Create one at <https://supabase.com>

---

## Getting started

### 1 — Clone and install

```bash
git clone https://github.com/<you>/task-list-app.git
cd task-list-app
npm install
```

### 2 — Set up the database

Open the **Supabase SQL editor** for your project and paste the contents of:

```
supabase/migrations/001_initial.sql
```

This creates the `tasks` table, the `updated_at` trigger, all RLS policies, and a partial unique index used for duplicate detection.

### 3 — Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Supabase project URL and anon key (both found at **Settings → API** in the Supabase dashboard):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4 — Run the development server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` automatically.

---

## Running the tests

```bash
npm test
```

All tests are pure unit tests — no database or network connection required.

### What the tests cover

| File | What it tests |
|---|---|
| `__tests__/csv-validation.test.ts` | CSV parser (quoted commas, Windows `\r\n`, blank rows), every validation rule (title, due date, priority), the full spec edge-case file |
| `__tests__/duplicate-handling.test.ts` | Intra-file deduplication, account-level deduplication, case-insensitive title matching, mixed scenarios |
| `__tests__/rls.test.ts` | Unauthenticated requests get 401; authenticated queries are scoped to `user_id`; migration SQL asserts RLS is enabled with correct policies; soft-delete is scoped per user |

---

## Features

### Tasks
- Create, view, edit, and **soft-delete** tasks (deleted rows keep `deleted_at` timestamp; nothing is ever hard-deleted)
- Toggle complete with a checkbox or via the status dropdown in the edit form
- Fields: **title** (required, ≤ 200 chars), **notes**, **due date**, **priority** 1–5, **status** (pending / in_progress / completed)

### Task list
- Full-text **search** on title (debounced, 200 ms)
- **Filter** by status and priority
- **Sort** by newest, due date (asc/desc), priority

### States
- Loading skeleton with spinner
- Empty state with call-to-action
- Error state with retry button

### CSV import (`/import`)
- Drag-and-drop or click-to-upload
- **Server-side** validation of every row
- Valid rows imported in a single batch insert (atomic at the DB level)
- Invalid rows shown in a table with row number and reason
- **Download rejected rows as CSV** for correction and re-upload
- Duplicate detection: same `lower(title)` + `due_date` already in the file **or** in the account

### Auth
- Email + password sign-up / sign-in
- Sessions stored as HTTP-only cookies via `@supabase/ssr`
- Middleware redirects unauthenticated requests to `/login`

### Security
- **Row Level Security** on the `tasks` table: each policy checks `auth.uid() = user_id`
- API routes re-check the session and scope all queries to the authenticated user
- Soft-delete respects RLS: `deleted_at` updates only succeed when `user_id` matches

---

## CSV format

```
title,due_date,priority,notes
Buy groceries,2025-01-15,2,Milk and eggs
Fix critical bug,2025-01-20,5,"Error in prod, urgent"
```

| Column | Required | Rules |
|---|---|---|
| `title` | ✓ | ≤ 200 characters |
| `due_date` | | YYYY-MM-DD or empty |
| `priority` | ✓ | Integer 1–5 |
| `notes` | | Free text, quoted commas OK |

A **Download template** button is available on the import page.

---

## Edge-case demo (spec requirement)

Upload `edge-case-demo.csv` (create it with the content below) to exercise every rule at once:

```csv
title,due_date,priority,notes
Existing Task,2025-01-10,3,Already in your account
,,2,
Some Task,2025-01-11,high,Bad priority
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,2025-01-12,2,Title 201 chars
"Task with, a comma",2025-01-13,1,Valid row
```

Expected result: 1 imported, 4 rejected (duplicate / missing title / bad priority / title too long).

> First add "Existing Task / 2025-01-10" manually so the account-level duplicate check fires.

---

## Project structure

```
task-list-app/
├── app/
│   ├── api/
│   │   ├── auth/callback/route.ts   # Supabase OAuth callback
│   │   ├── import/route.ts          # POST: validate + import CSV
│   │   └── tasks/
│   │       ├── route.ts             # GET list, POST create
│   │       └── [id]/route.ts        # GET, PUT update, DELETE soft-delete
│   ├── import/page.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── tasks/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # → redirects to /tasks or /login
├── components/
│   ├── AuthForm.tsx
│   ├── CSVImport.tsx
│   ├── Nav.tsx
│   ├── TaskForm.tsx                 # Create / edit modal
│   └── TaskListClient.tsx           # Full task list with filters
├── lib/
│   ├── csv.ts                       # Parser, validator, dedup logic
│   └── supabase/
│       ├── client.ts                # Browser Supabase client
│       └── server.ts                # Server Supabase client
├── supabase/
│   └── migrations/001_initial.sql   # Schema + RLS
├── types/index.ts
├── __tests__/
│   ├── csv-validation.test.ts
│   ├── duplicate-handling.test.ts
│   └── rls.test.ts
├── ai-log/                          # AI session transcripts
├── middleware.ts                    # Auth-guard for all routes
└── README.md
```

---

## What I would do next

Given more time, here's the priority order:

1. **Supabase CLI integration tests** — Use `supabase test db` with pgTAP fixtures to test RLS policies directly against a real Postgres instance. Unit-level mocking verifies the API logic; DB-level tests would prove the policies can't be bypassed.

2. **Proper DB transactions for import** — Wrap the batch insert in a Postgres function called via `supabase.rpc()` to get true atomicity. Currently a partial DB failure after a successful insert of some rows would leave orphaned records.

3. **Optimistic UI updates** — The task list currently re-fetches after mutations. React Query or SWR would give instant feedback with background sync.

4. **Pagination** — Large task lists need server-side cursor pagination (`range()` in Supabase).

5. **Task attachments / sub-tasks** — Natural next step for the data model.

6. **Email notifications** — Supabase Edge Functions + Resend for due-date reminders.

7. **Sorting and filtering persistence** — Store filter state in URL params (`useSearchParams`) so links are shareable.

8. **CI pipeline** — GitHub Actions: `npm test` + `next build` on every PR.

9. **Rate limiting on the import endpoint** — Prevent abuse with Upstash Redis or Supabase's built-in rate limiter.

10. **Accessibility audit** — Full keyboard nav, ARIA live regions for status changes, colour contrast check for priority dots.
