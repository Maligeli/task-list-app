/**
 * csv-validation.test.ts
 *
 * Unit tests for the CSV parsing and row-validation logic.
 * These tests exercise every rule listed in the spec and the
 * precise edge cases called out in the assessment:
 *
 *   - Blank row
 *   - Priority "high"
 *   - Title over 200 characters
 *   - Quoted field with a comma
 *   - Windows line endings (\r\n)
 */

import { parseCSVContent, validateRow, processCSV } from '../lib/csv'
import type { CSVRawRow } from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const validBase: CSVRawRow = {
  title: 'Buy groceries',
  due_date: '2025-01-15',
  priority: '2',
  notes: '',
}

function makeCSV(rows: string[]): string {
  return ['title,due_date,priority,notes', ...rows].join('\n')
}

// ─── parseCSVContent ──────────────────────────────────────────────────────────

describe('parseCSVContent', () => {
  test('parses a simple CSV', () => {
    const result = parseCSVContent('a,b,c\n1,2,3')
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  test('normalises Windows line endings (\\r\\n)', () => {
    const result = parseCSVContent('a,b\r\n1,2\r\n3,4')
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual(['1', '2'])
    expect(result[2]).toEqual(['3', '4'])
  })

  test('normalises legacy Mac line endings (\\r)', () => {
    const result = parseCSVContent('a,b\r1,2\r3,4')
    expect(result).toHaveLength(3)
  })

  test('silently skips completely blank rows', () => {
    const result = parseCSVContent('a,b\n\n1,2\n\n3,4')
    expect(result).toHaveLength(3)   // header + 2 data rows, not 5
  })

  test('handles a quoted field containing a comma', () => {
    const result = parseCSVContent('a,b\n"hello, world",two')
    expect(result[1][0]).toBe('hello, world')
  })

  test('handles doubled quotes inside a quoted field', () => {
    const result = parseCSVContent('a,b\n"say ""hi""",two')
    expect(result[1][0]).toBe('say "hi"')
  })

  test('handles an empty file', () => {
    expect(parseCSVContent('')).toHaveLength(0)
  })

  test('handles a file with only blank lines', () => {
    expect(parseCSVContent('\r\n\r\n\n')).toHaveLength(0)
  })
})

// ─── validateRow ──────────────────────────────────────────────────────────────

describe('validateRow – title', () => {
  test('accepts a normal title', () => {
    expect(validateRow(validBase)).toBeNull()
  })

  test('rejects an empty title', () => {
    expect(validateRow({ ...validBase, title: '' })).toMatch(/title is required/i)
  })

  test('rejects a whitespace-only title', () => {
    expect(validateRow({ ...validBase, title: '   ' })).toMatch(/title is required/i)
  })

  test('rejects a title of exactly 201 characters', () => {
    const longTitle = 'A'.repeat(201)
    const result = validateRow({ ...validBase, title: longTitle })
    expect(result).toMatch(/200/i)
  })

  test('accepts a title of exactly 200 characters', () => {
    expect(validateRow({ ...validBase, title: 'A'.repeat(200) })).toBeNull()
  })
})

describe('validateRow – due_date', () => {
  test('accepts a valid YYYY-MM-DD date', () => {
    expect(validateRow({ ...validBase, due_date: '2025-06-15' })).toBeNull()
  })

  test('accepts an empty due_date', () => {
    expect(validateRow({ ...validBase, due_date: '' })).toBeNull()
  })

  test('rejects "high" as a due_date', () => {
    expect(validateRow({ ...validBase, due_date: 'high' })).toMatch(/YYYY-MM-DD/i)
  })

  test('rejects DD/MM/YYYY format', () => {
    expect(validateRow({ ...validBase, due_date: '15/01/2025' })).toMatch(/YYYY-MM-DD/i)
  })

  test('rejects an impossible calendar date (Feb 30)', () => {
    expect(validateRow({ ...validBase, due_date: '2025-02-30' })).toMatch(/valid calendar date/i)
  })

  test('rejects a month of 13', () => {
    expect(validateRow({ ...validBase, due_date: '2025-13-01' })).toMatch(/valid calendar date/i)
  })
})

describe('validateRow – priority', () => {
  test.each([1, 2, 3, 4, 5])('accepts priority %d', (p) => {
    expect(validateRow({ ...validBase, priority: String(p) })).toBeNull()
  })

  test('rejects priority "high" (the spec edge case)', () => {
    const result = validateRow({ ...validBase, priority: 'high' })
    expect(result).toMatch(/whole number/i)
  })

  test('rejects priority 0', () => {
    expect(validateRow({ ...validBase, priority: '0' })).toMatch(/1 to 5/i)
  })

  test('rejects priority 6', () => {
    expect(validateRow({ ...validBase, priority: '6' })).toMatch(/1 to 5/i)
  })

  test('rejects a float like 2.5', () => {
    expect(validateRow({ ...validBase, priority: '2.5' })).toMatch(/whole number/i)
  })

  test('rejects an empty priority', () => {
    expect(validateRow({ ...validBase, priority: '' })).toMatch(/required/i)
  })
})

// ─── processCSV – the full pipeline ──────────────────────────────────────────

describe('processCSV – full pipeline', () => {
  test('the spec edge-case file: all bad rows reported, good row imported', () => {
    const longTitle = 'T'.repeat(201)

    // The spec edge case:
    //  row 2 – duplicate (added to the "existing" set below)
    //  row 3 – blank row (skipped silently, so it won't appear in valid OR invalid)
    //  row 4 – priority "high"
    //  row 5 – title over 200 chars
    //  row 6 – quoted field with a comma  ← the VALID row
    const csvContent = [
      'title,due_date,priority,notes',
      'Existing task,2025-01-10,3,',             // row 2 – duplicate
      ',,,',                                       // row 3 – blank (all fields empty but present)
      'Some task,2025-01-11,high,',               // row 4 – bad priority
      `${longTitle},2025-01-12,2,`,               // row 5 – title too long
      '"Task with, comma",2025-01-13,1,Some note', // row 6 – valid
    ].join('\n')

    const existingKeys = new Set(['existing task::2025-01-10'])

    const { valid, invalid } = processCSV(csvContent, existingKeys)

    // Exactly one valid row (the quoted-comma row)
    expect(valid).toHaveLength(1)
    expect(valid[0].data.title).toBe('Task with, comma')
    expect(valid[0].data.priority).toBe('1')

    // Three invalid rows (blank row is silently skipped, not counted as invalid)
    expect(invalid).toHaveLength(3)

    const reasons = invalid.map((e) => e.reason)
    expect(reasons.some((r) => /duplicate/i.test(r))).toBe(true)
    expect(reasons.some((r) => /whole number|priority/i.test(r))).toBe(true)
    expect(reasons.some((r) => /200/i.test(r))).toBe(true)
  })

  test('reports correct 1-based row numbers (accounting for header)', () => {
    const csv = makeCSV(['valid task,2025-01-01,1,', ',,,bad-empty'])
    const { invalid } = processCSV(csv)
    // Row 3 is the empty-title row (row 1 = header, row 2 = valid, row 3 = bad)
    expect(invalid[0].rowNum).toBe(3)
  })

  test('handles Windows line endings end-to-end', () => {
    const csv = 'title,due_date,priority,notes\r\nMy Task,2025-01-01,3,\r\n'
    const { valid, invalid } = processCSV(csv)
    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(0)
    expect(valid[0].data.title).toBe('My Task')
  })

  test('returns empty results for an empty file', () => {
    const { valid, invalid } = processCSV('')
    expect(valid).toHaveLength(0)
    expect(invalid).toHaveLength(0)
  })
})
