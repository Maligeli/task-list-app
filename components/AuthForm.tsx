'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Props {
  mode: 'login' | 'signup'
}

export default function AuthForm({ mode }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const isLogin = mode === 'login'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/tasks')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/api/auth/callback` },
        })
        if (error) throw error
        setSuccess('Account created! Check your email to confirm, then log in.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-title">
          <h1>✓ Tasks</h1>
          <p className="text-muted text-sm">{isLogin ? 'Sign in to your account' : 'Create your account'}</p>
        </div>

        {error   && <div className="alert alert-error mb-3">{error}</div>}
        {success && <div className="alert alert-success mb-3">{success}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-control"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
            {loading ? <span className="spinner" /> : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          {isLogin ? (
            <>Don't have an account? <Link href="/signup">Sign up</Link></>
          ) : (
            <>Already have an account? <Link href="/login">Sign in</Link></>
          )}
        </div>
      </div>
    </div>
  )
}
