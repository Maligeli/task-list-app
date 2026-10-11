/**
 * duplicate-handling.test.ts
 *
 * Tests for duplicate detection in the CSV import pipeline.
 * A task is a duplicate if title+due_date already exists:
 *   1. In the same file (intra-file)
 *   2. In the user's account (inter-account)
 *
 * Matching is case-insensitive on title; due_date is compared as-is (YYYY-MM-DD).
 */

import { processCSV } from '../lib/csv'

const HEADER = 'title,due_date,priority,notes'

function csv(...rows: string[]) {
  return [HEADER, ...rows].join('\n')
}

// ─── Intra-file duplicates ────────────────────────────────────────────────────

describe('intra-file duplicate detection', () => {
  test('second identical row (same title + due_date) is rejected', () => {
    const content = csv(
      'Buy milk,2025-02-01,2,',
      'Buy milk,2025-02-01,3,Different notes'
    )
    const { valid, invalid } = processCSV(content)

    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].rowNum).toBe(3)
    expect(invalid[0].reason).toMatch(/duplicate/i)
    expect(invalid[0].reason).toMatch(/file/i)
  })

  test('duplicate detection is case-insensitive on title', () => {
    const content = csv(
      'Buy Milk,2025-02-01,2,',
      'buy milk,2025-02-01,2,'
    )
    const { valid, invalid } = processCSV(content)

    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].reason).toMatch(/duplicate/i)
  })

  test('same title with DIFFERENT due_date is NOT a duplicate', () => {
    const content = csv(
      'Buy milk,2025-02-01,2,',
      'Buy milk,2025-02-02,2,'
    )
    const { valid, invalid } = processCSV(content)

    expect(valid).toHaveLength(2)
    expect(invalid).toHaveLength(0)
  })

  test('same title with one empty and one filled due_date is NOT a duplicate', () => {
    const content = csv(
      'Buy milk,,2,',
      'Buy milk,2025-02-01,2,'
    )
    const { valid, invalid } = processCSV(content)
    expect(valid).toHaveLength(2)
  })

  test('three rows where first is valid, second and third are duplicates', () => {
    const content = csv(
      'Fix bug,2025-03-01,5,',
      'Fix bug,2025-03-01,4,',
      'Fix bug,2025-03-01,3,'
    )
    const { valid, invalid } = processCSV(content)

    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(2)
    // Both duplicates reference "file" in the reason
    invalid.forEach((e) => expect(e.reason).toMatch(/file/i))
  })
})

// ─── Account-level duplicates ─────────────────────────────────────────────────

describe('account-level (existing tasks) duplicate detection', () => {
  test('row matching an existing account task is rejected', () => {
    // existing: "weekly report" on 2025-01-20
    const existing = new Set(['weekly report::2025-01-20'])
    const content = csv('Weekly Report,2025-01-20,3,')

    const { valid, invalid } = processCSV(content, existing)

    expect(valid).toHaveLength(0)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].reason).toMatch(/account/i)
  })

  test('account-level duplicate check is case-insensitive', () => {
    const existing = new Set(['deploy release::2025-06-01'])
    const content = csv('Deploy Release,2025-06-01,4,')

    const { valid, invalid } = processCSV(content, existing)
    expect(valid).toHaveLength(0)
    expect(invalid[0].reason).toMatch(/account/i)
  })

  test('non-matching row passes through even when existing set is populated', () => {
    const existing = new Set(['old task::2025-01-01'])
    const content = csv('New task,2025-06-15,2,')

    const { valid, invalid } = processCSV(content, existing)
    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(0)
  })

  test('when row is rejected as account-dup, subsequent identical rows also hit account-dup', () => {
    // Row 2 matches the account → rejected, NOT added to seenInFile.
    // Row 3 also matches the account (still not in seenInFile) → rejected as account dup too.
    // This is correct: an unimported row cannot "own" the title+due_date slot.
    const existing = new Set(['my task::2025-01-01'])
    const content = csv(
      'My Task,2025-01-01,1,',  // row 2 – account dup
      'My Task,2025-01-01,1,'   // row 3 – also account dup (row 2 was never added to seenInFile)
    )

    const { valid, invalid } = processCSV(content, existing)
    expect(valid).toHaveLength(0)
    expect(invalid).toHaveLength(2)
    // Both are rejected because neither was ever accepted into seenInFile
    expect(invalid[0].reason).toMatch(/account/i)
    expect(invalid[1].reason).toMatch(/account/i)
  })

  test('intra-file dup is detected correctly when first occurrence is valid', () => {
    // Row 2 is NOT in the account → accepted, added to seenInFile.
    // Row 3 is now an intra-file dup.
    const existing = new Set<string>()
    const content = csv(
      'New Task,2025-03-15,2,',  // row 2 – valid
      'New Task,2025-03-15,2,'   // row 3 – intra-file dup
    )

    const { valid, invalid } = processCSV(content, existing)
    expect(valid).toHaveLength(1)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].reason).toMatch(/file/i)
  })
})

// ─── Mixed scenarios ──────────────────────────────────────────────────────────

describe('mixed valid, duplicate and invalid rows', () => {
  test('only valid, non-duplicate rows are in the valid list', () => {
    const existing = new Set(['taken::2025-01-01'])
    const content = csv(
      'Taken,2025-01-01,1,',           // account dup → invalid
      'Good task,2025-01-02,3,',        // valid
      'Good task,2025-01-02,3,',        // intra-file dup → invalid
      ',2025-01-03,2,',                 // no title → invalid
      'Another good one,2025-01-04,2,' // valid
    )

    const { valid, invalid } = processCSV(content, existing)

    expect(valid).toHaveLength(2)
    expect(invalid).toHaveLength(3)

    const validTitles = valid.map((v) => v.data.title)
    expect(validTitles).toContain('Good task')
    expect(validTitles).toContain('Another good one')
  })
})
