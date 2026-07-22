import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'

export default function ProtectedRoute({
  children,
}: {
  children: ReactNode
}) {
  const auth = useAuth()

  if (auth.state === 'loading') {
    return <div data-testid="loading-spinner">Loading…</div>
  }

  if (auth.state === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  if (auth.state === 'mfa_required') {
    return <Navigate to="/mfa" replace />
  }

  return <>{children}</>
}
