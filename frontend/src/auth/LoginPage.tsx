import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    try {
      const result = await auth.login(data.email, data.password)
      if (result.requiresMfa) {
        navigate('/mfa', {
          state: {
            temporaryToken: result.temporaryToken,
            tenantId: result.tenantId,
          },
        })
      } else {
        navigate('/dashboard')
      }
    } catch {
      setError('root', { message: 'Credenciais inválidas.' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">TJSys</h1>
          <p className="text-sm text-neutral-500 mt-1">Painel Administrativo</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input id="email" type="email" {...register('email')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-2 focus:outline-primary-500 focus:border-primary-500" placeholder="seu@email.com" />
            {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">Senha</label>
            <input id="password" type="password" {...register('password')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-2 focus:outline-primary-500 focus:border-primary-500" />
            {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-danger text-center">
              {errors.root.message}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer">
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
