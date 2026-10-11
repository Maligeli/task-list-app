'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userEmail: string
}

export default function Nav({ userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/tasks" className="nav-brand">✓ Tasks</Link>

        <div className="nav-links">
          <Link href="/tasks"  className={`nav-link ${pathname === '/tasks'  ? 'active' : ''}`}>My Tasks</Link>
          <Link href="/import" className={`nav-link ${pathname === '/import' ? 'active' : ''}`}>Import CSV</Link>
        </div>

        <div className="nav-user">
          <span className="text-sm">{userEmail}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </nav>
  )
}
