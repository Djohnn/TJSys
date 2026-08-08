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
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)

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
      if (isRecoveryMode || code.length >= 8) {
        if (!state?.tenantId) throw new Error('Tenant MFA não informado.')
        await auth.verifyRecovery(state.tenantId, code)
      } else {
        if (!state?.temporaryToken) throw new Error('Sessão MFA não informada.')
        await auth.challengeMfa(state.temporaryToken, code)
      }
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Código inválido.'
      setError(msg.includes('validation error') ? 'Código inválido ou expirado.' : msg)
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
          <p className="text-sm text-neutral-500 mt-1">Verificação em duas etapas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-neutral-500 text-center">
            {isRecoveryMode
              ? 'Digite o código de recuperação ou emergência'
              : 'Digite os 6 dígitos do aplicativo autenticador'}
          </p>

          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-neutral-700 mb-1">
              Código
            </label>
            <input
              id="mfa-code"
              type="text"
              autoComplete="one-time-code"
              value={code}
              onChange={e => {
                const regex = isRecoveryMode ? /[^a-zA-Z0-9]/g : /\D/g
                setCode(e.target.value.replace(regex, ''))
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-xl text-center tracking-widest font-mono focus:outline-2 focus:outline-primary-500"
              placeholder={isRecoveryMode ? '12345678' : '000000'}
              maxLength={isRecoveryMode ? 10 : 6}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-danger text-center">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting || (isRecoveryMode ? code.length < 8 : code.length < 6)}
            className="w-full py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Verificando...' : 'Entrar'}
          </button>

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                setIsRecoveryMode(!isRecoveryMode)
                setCode('')
                setError(null)
              }}
              className="text-sm font-medium text-primary-600 hover:text-primary-500 cursor-pointer"
            >
              {isRecoveryMode
                ? 'Usar aplicativo autenticador em vez disso'
                : 'Não tenho meu dispositivo / código de emergência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}