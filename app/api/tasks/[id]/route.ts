import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UpdateTaskPayload } from '@/types'

type Params = { params: Promise<{ id: string }> }

// GET /api/tasks/:id
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)   // RLS covers this too, but be explicit
    .is('deleted_at', null)
    .single()

  if (error) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PUT /api/tasks/:id
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: UpdateTaskPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) {
    if (!body.title.trim()) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    if (body.title.length > 200) return NextResponse.json({ error: 'Title too long' }, { status: 400 })
    updates.title = body.title.trim()
  }
  if (body.notes     !== undefined) updates.notes    = body.notes?.trim() || null
  if (body.due_date  !== undefined) updates.due_date = body.due_date || null
  if (body.priority  !== undefined) {
    if (body.priority < 1 || body.priority > 5) {
      return NextResponse.json({ error: 'Priority must be 1–5' }, { status: 400 })
    }
    updates.priority = body.priority
  }
  if (body.status !== undefined) updates.status = body.status

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/tasks/:id  – soft delete
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
