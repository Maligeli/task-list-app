import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import TaskListClient from '@/components/TaskListClient'

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="app-shell">
      <Nav userEmail={user.email ?? ''} />
      <main className="main">
        <TaskListClient />
      </main>
    </div>
  )
}
