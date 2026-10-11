'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, TaskFilters, TaskPriority, TaskStatus } from '@/types'
import TaskForm from './TaskForm'

const PRIORITY_LABELS: Record<number, string> = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' }
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export default function TaskListClient() {
  const [tasks, setTasks]       = useState<Task[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)

  const [filters, setFilters] = useState<TaskFilters>({
    search: '',
    status: 'all',
    priority: 'all',
    sort: 'created_desc',
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchTasks = useCallback(async (f: TaskFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (f.search)   params.set('search',   f.search)
      if (f.status)   params.set('status',   f.status)
      if (f.priority) params.set('priority', String(f.priority))
      if (f.sort)     params.set('sort',     f.sort)

      const res = await fetch(`/api/tasks?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setTasks(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search, immediate for other filters
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchTasks(filters), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchTasks])

  function setFilter<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleComplete(task: Task) {
    setCompleting(task.id)
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Update failed')
      const updated: Task = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setCompleting(null)
    }
  }

  function onSaved(task: Task, isNew: boolean) {
    if (isNew) {
      setTasks((prev) => [task, ...prev])
    } else {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
    setShowForm(false)
    setEditTask(null)
  }

  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>My Tasks</h1>
          <p className="text-muted mt-1">{loading ? '' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTask(null); setShowForm(true) }}>
          + New Task
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          className="form-control search-input"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />

        <select
          className="form-control"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as TaskStatus | 'all')}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>

        <select
          className="form-control"
          value={filters.priority}
          onChange={(e) => setFilter('priority', e.target.value as unknown as TaskPriority | 'all')}
        >
          <option value="all">All priorities</option>
          {[1,2,3,4,5].map((p) => (
            <option key={p} value={p}>Priority {p}</option>
          ))}
        </select>

        <select
          className="form-control"
          value={filters.sort}
          onChange={(e) => setFilter('sort', e.target.value as TaskFilters['sort'])}
        >
          <option value="created_desc">Newest first</option>
          <option value="due_date_asc">Due date ↑</option>
          <option value="due_date_desc">Due date ↓</option>
          <option value="priority_desc">Priority ↓</option>
        </select>
      </div>

      {/* Content */}
      <div className="card">
        {loading && (
          <div className="state-box">
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p className="mt-3">Loading tasks…</p>
          </div>
        )}

        {!loading && error && (
          <div className="state-box">
            <div className="state-icon">⚠️</div>
            <h3>Something went wrong</h3>
            <p>{error}</p>
            <button className="btn btn-ghost" onClick={() => fetchTasks(filters)}>Try again</button>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="state-box">
            <div className="state-icon">📋</div>
            <h3>{filters.search || filters.status !== 'all' || filters.priority !== 'all' ? 'No matching tasks' : 'No tasks yet'}</h3>
            <p>{filters.search || filters.status !== 'all' || filters.priority !== 'all'
              ? 'Try adjusting your filters.'
              : 'Create your first task or import a CSV to get started.'}</p>
            {!filters.search && filters.status === 'all' && filters.priority === 'all' && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Task</button>
            )}
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className={task.status === 'completed' ? 'completed' : ''}>
                    {/* Checkbox */}
                    <td>
                      <input
                        type="checkbox"
                        checked={task.status === 'completed'}
                        onChange={() => handleToggleComplete(task)}
                        disabled={completing === task.id}
                        title="Toggle complete"
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>

                    {/* Title + notes */}
                    <td>
                      <div className={`task-title ${task.status === 'completed' ? 'done' : ''}`}>
                        {task.title}
                      </div>
                      {task.notes && (
                        <div className="text-sm text-muted mt-1" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.notes}
                        </div>
                      )}
                    </td>

                    {/* Priority */}
                    <td>
                      <span className={`priority-dot priority-${task.priority}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </td>

                    {/* Due date */}
                    <td className="text-sm">
                      {task.due_date
                        ? new Date(task.due_date + 'T00:00:00').toLocaleDateString()
                        : <span className="text-muted">—</span>}
                    </td>

                    {/* Status badge */}
                    <td>
                      <span className={`badge badge-${task.status}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="task-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setEditTask(task); setShowForm(true) }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(task.id)}
                          disabled={deleting === task.id}
                        >
                          {deleting === task.id ? <span className="spinner" /> : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {showForm && (
        <TaskForm
          task={editTask}
          onSaved={onSaved}
          onCancel={() => { setShowForm(false); setEditTask(null) }}
        />
      )}
    </>
  )
}
