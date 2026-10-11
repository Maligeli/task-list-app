import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CreateTaskPayload } from '@/types'

// GET /api/tasks  – list tasks for the authenticated user
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const search   = url.searchParams.get('search')   ?? ''
  const status   = url.searchParams.get('status')   ?? 'all'
  const priority = url.searchParams.get('priority') ?? 'all'
  const sort     = url.searchParams.get('sort')     ?? 'created_desc'

  // RLS enforces user_id automatically; we also add it explicitly for clarity
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }
  if (status !== 'all') {
    query = query.eq('status', status)
  }
  if (priority !== 'all') {
    query = query.eq('priority', Number(priority))
  }

  switch (sort) {
    case 'due_date_asc':   query = query.order('due_date', { ascending: true,  nullsFirst: false }); break
    case 'due_date_desc':  query = query.order('due_date', { ascending: false, nullsFirst: false }); break
    case 'priority_desc':  query = query.order('priority', { ascending: false }); break
    default:               query = query.order('created_at', { ascending: false }); break
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/tasks  – create a new task
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateTaskPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, notes, due_date, priority, status } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'Title must be 200 characters or fewer' }, { status: 400 })
  }
  if (priority == null || priority < 1 || priority > 5 || !Number.isInteger(priority)) {
    return NextResponse.json({ error: 'Priority must be 1–5' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      title: title.trim(),
      notes: notes?.trim() || null,
      due_date: due_date || null,
      priority,
      status: status ?? 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
