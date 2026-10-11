'use client'

import { useEffect, useState } from 'react'
import type { Task, CreateTaskPayload, TaskPriority, TaskStatus } from '@/types'

interface Props {
  task: Task | null      // null = create mode
  onSaved: (task: Task, isNew: boolean) => void
  onCancel: () => void
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'pending',     label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
]

export default function TaskForm({ task, onSaved, onCancel }: Props) {
  const isNew = task === null

  const [title,    setTitle]    = useState(task?.title    ?? '')
  const [notes,    setNotes]    = useState(task?.notes    ?? '')
  const [dueDate,  setDueDate]  = useState(task?.due_date ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 3)
  const [status,   setStatus]   = useState<TaskStatus>(task?.status ?? 'pending')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Reset form when task changes
  useEffect(() => {
    setTitle(task?.title    ?? '')
    setNotes(task?.notes    ?? '')
    setDueDate(task?.due_date ?? '')
    setPriority(task?.priority ?? 3)
    setStatus(task?.status ?? 'pending')
    setError(null)
  }, [task])

  // Trap focus inside modal + ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const payload: CreateTaskPayload = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      due_date: dueDate || undefined,
      priority,
      status,
    }

    try {
      const url = isNew ? '/api/tasks' : `/api/tasks/${task!.id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data, isNew)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Edit task'}>
        <div className="modal-header">
          <h2>{isNew ? 'New Task' : 'Edit Task'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="task-title">
                Title <span className="req">*</span>
              </label>
              <input
                id="task-title"
                className="form-control"
                placeholder="Task title"
                maxLength={200}
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="form-hint">{title.length}/200</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="task-notes">Notes</label>
              <textarea
                id="task-notes"
                className="form-control"
                placeholder="Optional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="task-due">Due Date</label>
                <input
                  id="task-due"
                  type="date"
                  className="form-control"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="task-priority">
                  Priority <span className="req">*</span>
                </label>
                <select
                  id="task-priority"
                  className="form-control"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
                >
                  {[1,2,3,4,5].map((p) => (
                    <option key={p} value={p}>P{p}{p === 5 ? ' (highest)' : p === 1 ? ' (lowest)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : isNew ? 'Create Task' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
