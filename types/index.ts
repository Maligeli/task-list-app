export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 1 | 2 | 3 | 4 | 5

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  due_date: string | null   // ISO date string YYYY-MM-DD
  priority: TaskPriority
  status: TaskStatus
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateTaskPayload {
  title: string
  notes?: string
  due_date?: string
  priority: TaskPriority
  status?: TaskStatus
}

export interface UpdateTaskPayload {
  title?: string
  notes?: string
  due_date?: string
  priority?: TaskPriority
  status?: TaskStatus
}

// CSV types
export interface CSVRawRow {
  title: string
  due_date: string
  priority: string
  notes: string
}

export interface CSVValidRow {
  rowNum: number
  data: CSVRawRow
}

export interface CSVInvalidRow {
  rowNum: number
  reason: string
  raw: CSVRawRow
}

export interface ImportResult {
  imported: number
  errors: CSVInvalidRow[]
}

// Task filters
export interface TaskFilters {
  search?: string
  status?: TaskStatus | 'all'
  priority?: TaskPriority | 'all'
  sort?: 'due_date_asc' | 'due_date_desc' | 'priority_desc' | 'created_desc'
}
