import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import CSVImport from '@/components/CSVImport'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="app-shell">
      <Nav userEmail={user.email ?? ''} />
      <main className="main">
        <div className="page-header">
          <div>
            <h1>Import Tasks</h1>
            <p className="text-muted mt-1">Upload a CSV file to bulk-import tasks.</p>
          </div>
        </div>
        <CSVImport />
      </main>
    </div>
  )
}
