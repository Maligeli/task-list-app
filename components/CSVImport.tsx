'use client'

import { useRef, useState } from 'react'
import type { ImportResult, CSVInvalidRow } from '@/types'
import { rejectedRowsToCSV } from '@/lib/csv'

const TEMPLATE = `title,due_date,priority,notes
Buy groceries,2025-01-15,2,Milk and eggs
Fix bug #42,2025-01-20,5,Check error logs
`

export default function CSVImport() {
  const [dragOver,  setDragOver]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState<ImportResult | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a CSV file.')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      setResult(data as ImportResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset file input so the same file can be re-uploaded after a fix
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    uploadFile(files[0])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  function downloadRejected(errors: CSVInvalidRow[]) {
    const csv = rejectedRowsToCSV(errors)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'rejected-rows.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'tasks-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="import-grid">
      {/* Left column: upload */}
      <div>
        <div className="card card-body" style={{ marginBottom: '1rem' }}>
          <h2 className="mb-3">Upload CSV</h2>

          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto .75rem' }} />
                <p>Importing…</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</p>
                <p><strong>Click or drag &amp; drop</strong> a CSV file here</p>
                <p className="text-sm text-muted">Max 5 MB</p>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {error && <div className="alert alert-error mt-3">{error}</div>}
        </div>

        {/* Format reference */}
        <div className="card card-body">
          <h3 className="mb-2">Expected columns</h3>
          <table className="error-table">
            <thead>
              <tr><th>Column</th><th>Rules</th></tr>
            </thead>
            <tbody>
              <tr><td><code>title</code></td><td>Required, max 200 chars</td></tr>
              <tr><td><code>due_date</code></td><td>Optional, YYYY-MM-DD</td></tr>
              <tr><td><code>priority</code></td><td>Required, integer 1–5</td></tr>
              <tr><td><code>notes</code></td><td>Optional, free text</td></tr>
            </tbody>
          </table>
          <button className="btn btn-ghost btn-sm mt-3" onClick={downloadTemplate}>
            ⬇ Download template
          </button>
        </div>
      </div>

      {/* Right column: results */}
      <div>
        {result === null && !uploading && (
          <div className="card">
            <div className="state-box">
              <div className="state-icon">📊</div>
              <h3>No results yet</h3>
              <p>Upload a CSV file to see import results here.</p>
            </div>
          </div>
        )}

        {result !== null && (
          <div className="import-results">
            {/* Summary */}
            <div className="alert alert-success">
              <strong>✓ {result.imported} task{result.imported !== 1 ? 's' : ''} imported successfully</strong>
              {result.errors.length > 0 && (
                <> &nbsp;·&nbsp; {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} rejected</>
              )}
            </div>

            {/* Errors table */}
            {result.errors.length > 0 && (
              <div className="card card-body">
                <div className="flex items-center justify-between mb-3">
                  <h3>Rejected rows</h3>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => downloadRejected(result.errors)}
                  >
                    ⬇ Download rejected rows
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="error-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Reason</th>
                        <th>Title</th>
                        <th>Due date</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td><code>{e.rowNum}</code></td>
                          <td className="reason-cell">{e.reason}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.raw.title || <em className="text-muted">empty</em>}
                          </td>
                          <td>{e.raw.due_date || '—'}</td>
                          <td>{e.raw.priority || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
