import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      const result = await auth.login(data.email, data.password)
      if (result.requiresMfa) {
        navigate('/mfa', { state: { temporaryToken: result.temporaryToken } })
      } else {
        navigate('/')
      }
    } catch {
      setError('root', { message: 'Invalid credentials' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {errors.root && <p role="alert">{errors.root.message}</p>}
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p>{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p>{errors.password.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
