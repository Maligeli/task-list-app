import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processCSV } from '@/lib/csv'
import type { ImportResult } from '@/types'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Accept multipart/form-data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 })
  }

  const content = await file.text()

  // ── Fetch existing tasks for duplicate detection ────────────────────────
  // We build a Set<"lower(title)::due_date"> using RLS-scoped query
  const { data: existingTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('title, due_date')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch existing tasks' }, { status: 500 })
  }

  const existingKeys = new Set(
    (existingTasks ?? []).map(
      (t: { title: string; due_date: string | null }) =>
        `${t.title.toLowerCase()}::${t.due_date ?? ''}`
    )
  )

  // ── Parse + validate + dedup ────────────────────────────────────────────
  const { valid, invalid } = processCSV(content, existingKeys)

  // ── Import valid rows in a single transaction ───────────────────────────
  let imported = 0
  const importErrors = [...invalid]

  if (valid.length > 0) {
    const rows = valid.map(({ data: r }) => ({
      user_id: user.id,
      title: r.title.trim(),
      notes: r.notes.trim() || null,
      due_date: r.due_date.trim() || null,
      priority: Number(r.priority),
      status: 'pending' as const,
    }))

    // Supabase doesn't expose raw transactions via the REST API, so we use
    // upsert with onConflict='title,due_date' combined with a DB unique index.
    // For a proper multi-statement transaction you would use supabase.rpc().
    const { error: insertError, count } = await supabase
      .from('tasks')
      .insert(rows, { count: 'exact' })

    if (insertError) {
      // If the DB unique constraint fires, it means a race condition created a
      // duplicate between our pre-check and the insert.  Treat the whole
      // batch as a failed import and surface the DB error.
      return NextResponse.json(
        { error: `Database error during import: ${insertError.message}` },
        { status: 500 }
      )
    }

    imported = count ?? rows.length
  }

  const result: ImportResult = { imported, errors: importErrors }
  return NextResponse.json(result)
}
