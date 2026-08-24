import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const WHATSAPP_NUMBER = '5515998191175'

const demoSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome'),
  company: z.string().trim().min(2, 'Informe o nome da empresa'),
  whatsapp: z
    .string()
    .trim()
    .min(10, 'Informe um número de WhatsApp com DDD')
    .regex(/^\d+$/, 'Informe apenas números no WhatsApp'),
  email: z.string().trim().email('Email inválido'),
  operationSize: z.enum(['small', 'medium', 'large'], {
    errorMap: () => ({ message: 'Selecione o tamanho da operação' }),
  }),
})

type DemoForm = z.infer<typeof demoSchema>

const OPERATION_LABELS: Record<string, string> = {
  small: 'Pequena (1-2 lojas)',
  medium: 'Média (3-10 lojas)',
  large: 'Grande (11+ lojas)',
}

function buildWhatsAppUrl(data: DemoForm): string {
  const lines = [
    `Olá! Vim pela landing page do TJSys.`,
    ``,
    `Nome: ${data.name}`,
    `Empresa: ${data.company}`,
    `WhatsApp: ${data.whatsapp}`,
    `Email: ${data.email}`,
    `Operação: ${OPERATION_LABELS[data.operationSize]}`,
    ``,
    `Gostaria de solicitar uma demonstração.`,
  ]
  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}

interface DemoRequestFormProps {
  id?: string
}

export default function DemoRequestForm({ id }: DemoRequestFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DemoForm>({
    resolver: zodResolver(demoSchema),
  })

  function onSubmit(data: DemoForm) {
    const url = buildWhatsAppUrl(data)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      window.location.assign(url)
    }
  }

  const fieldClass = (hasError: boolean) =>
    `landing-input${hasError ? ' landing-input-error' : ''}`

  return (
    <form
      id={id}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      <div>
        <label
          htmlFor="demo-name"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Nome
        </label>
        <input
          id="demo-name"
          type="text"
          {...register('name')}
          className={fieldClass(!!errors.name)}
          placeholder="Seu nome completo"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'demo-name-error' : undefined}
        />
        {errors.name && (
          <p
            id="demo-name-error"
            role="alert"
            className="text-xs text-danger-600 mt-1"
          >
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="demo-company"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Empresa
        </label>
        <input
          id="demo-company"
          type="text"
          {...register('company')}
          className={fieldClass(!!errors.company)}
          placeholder="Nome da empresa"
          aria-required="true"
          aria-invalid={!!errors.company}
          aria-describedby={errors.company ? 'demo-company-error' : undefined}
        />
        {errors.company && (
          <p
            id="demo-company-error"
            role="alert"
            className="text-xs text-danger-600 mt-1"
          >
            {errors.company.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="demo-whatsapp"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          WhatsApp
        </label>
        <input
          id="demo-whatsapp"
          type="tel"
          {...register('whatsapp')}
          className={fieldClass(!!errors.whatsapp)}
          placeholder="(15) 99999-0000"
          aria-required="true"
          aria-invalid={!!errors.whatsapp}
          aria-describedby={errors.whatsapp ? 'demo-whatsapp-error' : undefined}
        />
        {errors.whatsapp && (
          <p
            id="demo-whatsapp-error"
            role="alert"
            className="text-xs text-danger-600 mt-1"
          >
            {errors.whatsapp.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="demo-email"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Email
        </label>
        <input
          id="demo-email"
          type="email"
          {...register('email')}
          className={fieldClass(!!errors.email)}
          placeholder="seu@email.com"
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'demo-email-error' : undefined}
        />
        {errors.email && (
          <p
            id="demo-email-error"
            role="alert"
            className="text-xs text-danger-600 mt-1"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="demo-size"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Tamanho da operação
        </label>
        <select
          id="demo-size"
          {...register('operationSize')}
          className={fieldClass(!!errors.operationSize)}
          defaultValue=""
          aria-required="true"
          aria-invalid={!!errors.operationSize}
          aria-describedby={
            errors.operationSize ? 'demo-size-error' : undefined
          }
        >
          <option value="" disabled>
            Selecione
          </option>
          <option value="small">Pequena (1-2 lojas)</option>
          <option value="medium">Média (3-10 lojas)</option>
          <option value="large">Grande (11+ lojas)</option>
        </select>
        {errors.operationSize && (
          <p
            id="demo-size-error"
            role="alert"
            className="text-xs text-danger-600 mt-1"
          >
            {errors.operationSize.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="landing-cta w-full"
      >
        {isSubmitting
          ? 'Abrindo WhatsApp...'
          : 'Conversar sobre uma demonstração'}
      </button>

      <p className="text-xs text-center text-neutral-500">
        Você será direcionado ao WhatsApp. Este formulário não envia nem
        armazena seus dados no TJSys.
      </p>
    </form>
  )
}
