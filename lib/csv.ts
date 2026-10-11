import type { CSVRawRow, CSVValidRow, CSVInvalidRow } from '@/types'

/**
 * Parse a complete CSV string into an array of field arrays.
 *
 * Handles:
 *  - Windows (\r\n) and legacy Mac (\r) line endings
 *  - Quoted fields containing commas, newlines, or doubled quotes ("")
 *  - Completely blank rows → silently skipped
 */
export function parseCSVContent(content: string): string[][] {
  // Normalise line endings to \n
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const rows: string[][] = []
  let i = 0

  while (i < text.length) {
    const { fields, nextIndex } = parseRow(text, i)
    i = nextIndex

    // Skip blank rows (every field is empty string)
    if (fields.length > 0 && fields.some((f) => f.trim() !== '')) {
      rows.push(fields)
    }
  }

  return rows
}

/** Parse one CSV row starting at `start`, return fields + index of next row start. */
function parseRow(text: string, start: number): { fields: string[]; nextIndex: number } {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = start

  while (i < text.length) {
    const ch = text[i]

    if (ch === '\n') {
      fields.push(current)
      return { fields, nextIndex: i + 1 }
    }

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
      i++
      continue
    }

    if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  // End of string – flush last field if anything present
  if (fields.length > 0 || current !== '') {
    fields.push(current)
  }

  return { fields, nextIndex: i }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate a single parsed row.
 * Returns an error string, or null when the row is valid.
 */
export function validateRow(row: CSVRawRow): string | null {
  const title = row.title.trim()

  if (!title) return 'Title is required'
  if (title.length > 200) return `Title exceeds 200 characters (${title.length})`

  if (row.due_date.trim()) {
    const d = row.due_date.trim()
    if (!DATE_RE.test(d)) return 'Due date must be YYYY-MM-DD'

    // Verify the date is actually valid (e.g. 2023-02-30 is not)
    const [y, m, day] = d.split('-').map(Number)
    const dt = new Date(`${d}T00:00:00`)
    if (
      isNaN(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() + 1 !== m ||
      dt.getDate() !== day
    ) {
      return 'Due date is not a valid calendar date'
    }
  }

  const raw = row.priority.trim()
  if (!raw) return 'Priority is required'

  const p = Number(raw)
  if (!Number.isInteger(p) || isNaN(p) || p < 1 || p > 5) {
    return 'Priority must be a whole number from 1 to 5'
  }

  return null
}

// ---------------------------------------------------------------------------
// Full pipeline: parse → validate → deduplicate within file
// ---------------------------------------------------------------------------

/**
 * Parse CSV content, validate every data row, and detect intra-file duplicates.
 *
 * @param content   Raw CSV text (any line-ending style)
 * @param existing  Set of "title::due_date" keys already in the account
 * @returns         { valid, invalid } where valid rows are safe to import
 */
export function processCSV(
  content: string,
  existing: Set<string> = new Set()
): { valid: CSVValidRow[]; invalid: CSVInvalidRow[] } {
  const allRows = parseCSVContent(content)

  if (allRows.length === 0) return { valid: [], invalid: [] }

  // First row is the header
  const headers = allRows[0].map((h) => h.toLowerCase().trim())
  const dataRows = allRows.slice(1)

  const col = (name: string) => headers.indexOf(name)

  const valid: CSVValidRow[] = []
  const invalid: CSVInvalidRow[] = []

  // Track title+due_date combos seen so far in this file (intra-file dedup)
  const seenInFile = new Set<string>()

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2 // 1-based, skipping the header row

    const rawRow: CSVRawRow = {
      title: (col('title') >= 0 ? row[col('title')] : '') ?? '',
      due_date: (col('due_date') >= 0 ? row[col('due_date')] : '') ?? '',
      priority: (col('priority') >= 0 ? row[col('priority')] : '') ?? '',
      notes: (col('notes') >= 0 ? row[col('notes')] : '') ?? '',
    }

    const error = validateRow(rawRow)
    if (error) {
      invalid.push({ rowNum, reason: error, raw: rawRow })
      return
    }

    // Duplicate detection key: normalised title + due_date
    const dupeKey = `${rawRow.title.trim().toLowerCase()}::${rawRow.due_date.trim()}`

    if (seenInFile.has(dupeKey)) {
      invalid.push({ rowNum, reason: 'Duplicate: same title and due date already in this file', raw: rawRow })
      return
    }
    if (existing.has(dupeKey)) {
      invalid.push({ rowNum, reason: 'Duplicate: task with this title and due date already exists in your account', raw: rawRow })
      return
    }

    seenInFile.add(dupeKey)
    valid.push({ rowNum, data: rawRow })
  })

  return { valid, invalid }
}

// ---------------------------------------------------------------------------
// Serialise rejected rows back to CSV (for download)
// ---------------------------------------------------------------------------

export function rejectedRowsToCSV(rows: CSVInvalidRow[]): string {
  const header = 'row_number,reason,title,due_date,priority,notes\n'
  const body = rows
    .map(({ rowNum, reason, raw }) =>
      [rowNum, reason, raw.title, raw.due_date, raw.priority, raw.notes]
        .map(csvEscape)
        .join(',')
    )
    .join('\n')
  return header + body
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
