import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from './AuthProvider'

interface MfaLocationState {
  temporaryToken?: string
}

export default function MfaPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as MfaLocationState | null
  const temporaryToken = state?.temporaryToken
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!temporaryToken) {
    navigate('/login', { replace: true })
    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await auth.challengeMfa(temporaryToken, code)
      navigate('/', { replace: true })
    } catch {
      setError('Invalid code. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p role="alert">{error}</p>}
      <div>
        <label htmlFor="mfa-code">Authentication Code</label>
        <input
          id="mfa-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  )
}
