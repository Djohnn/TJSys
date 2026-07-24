import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

interface MfaLocationState { temporaryToken?: string }

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
      setError('Código inválido. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Autenticação</h1>
          <p className="text-sm text-neutral-500 mt-1">Digite o código de verificação</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-neutral-700 mb-1">Código</label>
            <input id="mfa-code" type="text" value={code} onChange={e => setCode(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm text-center tracking-widest focus:outline-2 focus:outline-primary-500" placeholder="000000" maxLength={6} />
          </div>

          {error && <p className="text-sm text-danger text-center">{error}</p>}

          <button type="submit" disabled={isSubmitting || code.length < 6} className="w-full py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer">
            {isSubmitting ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
      </div>
    </div>
  )
}
