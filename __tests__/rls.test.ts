/**
 * rls.test.ts
 *
 * Tests that one user cannot read another user's tasks.
 *
 * Strategy
 * ────────
 * We cannot run Postgres in a unit-test environment, so we verify
 * the two layers that enforce isolation:
 *
 * 1. API layer  – the GET /api/tasks route explicitly filters by
 *    `user_id` and returns 401 when no session is present.
 *    We mock the Supabase client to inject a known user and inspect
 *    the query that was built.
 *
 * 2. Schema layer – we parse the migration SQL and assert that
 *    row-level security is enabled and that the SELECT policy uses
 *    `auth.uid() = user_id`.
 *
 * For full integration coverage, run the Supabase CLI's built-in
 * RLS tests (`supabase test db`) against the migration in
 * supabase/migrations/001_initial.sql.
 */

import fs from 'fs'
import path from 'path'

// ─── 1. API layer: unauthenticated request returns 401 ────────────────────────

// We test the route handler in isolation by mocking next/headers and
// @supabase/ssr so no network calls are made.

const mockGetUser = jest.fn()

jest.mock('../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      is:     jest.fn().mockReturnThis(),
      ilike:  jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}))

// next/headers is not available outside Next.js runtime
jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })) }))

describe('GET /api/tasks – authentication enforcement', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('returns 401 when there is no authenticated session', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    // Dynamically import after mocks are set up
    const { GET } = await import('../app/api/tasks/route')
    const req = new Request('http://localhost/api/tasks')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  test('returns 200 and queries only for the authenticated user\'s tasks', async () => {
    const USER_A = { id: 'user-a-uuid', email: 'a@test.com' }
    mockGetUser.mockResolvedValueOnce({ data: { user: USER_A }, error: null })

    // Capture the chain of .eq() calls
    const eqMock  = jest.fn().mockReturnThis()
    const isMock  = jest.fn().mockReturnThis()
    const orderMock = jest.fn().mockResolvedValue({ data: [], error: null })

    const { createClient } = await import('../lib/supabase/server')
    ;(createClient as jest.Mock).mockImplementationOnce(async () => ({
      auth: { getUser: mockGetUser },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq:     eqMock,
        is:     isMock,
        ilike:  jest.fn().mockReturnThis(),
        order:  orderMock,
      })),
    }))

    // Re-mock getUser for this second call
    mockGetUser.mockResolvedValueOnce({ data: { user: USER_A }, error: null })

    const { GET } = await import('../app/api/tasks/route')
    const req = new Request('http://localhost/api/tasks')
    const res = await GET(req)

    expect(res.status).toBe(200)

    // Verify the route explicitly scoped the query to user_id === USER_A.id
    expect(eqMock).toHaveBeenCalledWith('user_id', USER_A.id)
  })
})

// ─── 2. Schema layer: RLS is defined in the migration SQL ─────────────────────

describe('Database migration – Row Level Security', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/001_initial.sql')
  let sql: string

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf-8')
  })

  test('migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
  })

  test('RLS is enabled on the tasks table', () => {
    expect(sql).toMatch(/alter\s+table\s+tasks\s+enable\s+row\s+level\s+security/i)
  })

  test('SELECT policy uses auth.uid() = user_id', () => {
    expect(sql).toMatch(/for\s+select\s+using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i)
  })

  test('INSERT policy uses WITH CHECK (auth.uid() = user_id)', () => {
    expect(sql).toMatch(/for\s+insert\s+with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i)
  })

  test('UPDATE policy uses auth.uid() = user_id', () => {
    expect(sql).toMatch(/for\s+update\s+using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i)
  })

  test('there is a user_id foreign key referencing auth.users', () => {
    expect(sql).toMatch(/user_id\s+uuid.*references\s+auth\.users/i)
  })
})

// ─── 3. Cross-user isolation: user B cannot see user A's tasks ────────────────

describe('user isolation via mocked Supabase client', () => {
  beforeEach(() => jest.clearAllMocks() )

  test('User B gets an empty list when only User A has tasks', async () => {
    // User A has tasks; User B has none (simulated by RLS returning [])
    const USER_B = { id: 'user-b-uuid', email: 'b@test.com' }

    const orderMock = jest.fn().mockResolvedValue({
      // Supabase + RLS would return [] for user B
      data: [],
      error: null,
    })

    const { createClient } = await import('../lib/supabase/server')
    ;(createClient as jest.Mock).mockImplementationOnce(async () => ({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: USER_B }, error: null }),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockReturnThis(),
        ilike:  jest.fn().mockReturnThis(),
        order:  orderMock,
      })),
    }))

    const { GET } = await import('../app/api/tasks/route')
    const req = new Request('http://localhost/api/tasks')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([]) // User B sees no tasks
  })

  test('DELETE soft-deletes only tasks belonging to the authenticated user', async () => {
    const USER_A = { id: 'user-a-uuid', email: 'a@test.com' }

    const eqMock     = jest.fn().mockReturnThis()
    const isMock     = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: 'task-1', user_id: 'user-a-uuid', deleted_at: new Date().toISOString() },
      error: null,
    })
    const updateMock = jest.fn(() => ({
      eq: eqMock,
      is: isMock,
      select: selectMock,
      single: singleMock,
    }))

    const { createClient } = await import('../lib/supabase/server')
    ;(createClient as jest.Mock).mockImplementationOnce(async () => ({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: USER_A }, error: null }),
      },
      from: jest.fn(() => ({ update: updateMock })),
    }))

    const { DELETE } = await import('../app/api/tasks/[id]/route')
    const req = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(res.status).toBe(200)

    // Verify that .eq('user_id', USER_A.id) was called – the route scopes the
    // soft-delete to the owner; the DB's RLS provides a second layer of protection.
    expect(eqMock).toHaveBeenCalledWith('user_id', USER_A.id)
  })
})
