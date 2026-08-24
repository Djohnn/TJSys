import { useState, type FormEvent, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

interface MfaLocationState {
  temporaryToken?: string
  tenantId?: string
}

export default function MfaPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as MfaLocationState | null
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!state?.temporaryToken) {
      navigate('/login', { replace: true })
    }
  }, [state, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      if (!state?.tenantId) throw new Error('Tenant MFA não informado.')
      await auth.verifyRecovery(state.tenantId, code)
      navigate('/app', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codigo invalido.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!state?.temporaryToken) return null

  return (
    <div
      data-testid="mfa-page"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4"
    >
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Autenticação</h1>
          <p className="text-sm text-neutral-700 mt-1">Verificação em duas etapas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-neutral-500 text-center">Digite um código de recuperação de 10 caracteres</p>

          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-neutral-700 mb-1">Código de Recuperação</label>
            <input id="mfa-code" type="text" value={code} onChange={e => setCode(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-center tracking-widest font-mono focus:outline-2 focus:outline-primary-500"
              placeholder="31de82a6e8" maxLength={10} />
          </div>

          {error && <p className="text-sm text-danger text-center">{error}</p>}

          <button type="submit" disabled={isSubmitting || code.length < 10}
            className="w-full py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer">
            {isSubmitting ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
      </div>
    </div>
  )
}
