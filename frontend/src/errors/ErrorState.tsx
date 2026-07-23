import type { ReactNode } from 'react'

const ERROR_MAP: Record<number, { title: string; defaultMessage: string }> = {
  401: { title: 'Sessão expirada', defaultMessage: 'Faça login novamente para continuar.' },
  403: { title: 'Acesso negado', defaultMessage: 'Você não tem permissão para acessar este recurso.' },
  404: { title: 'Página não encontrada', defaultMessage: 'O recurso solicitado não foi encontrado.' },
  409: { title: 'Conflito', defaultMessage: 'Houve um conflito ao processar a solicitação.' },
}

export default function ErrorState({
  status,
  message,
  correlationId,
  onRetry,
  logout,
}: {
  status?: number
  message?: string
  correlationId?: string
  onRetry?: () => void
  logout?: () => void
}): ReactNode {
  const isServerError = status !== undefined && status >= 500
  const entry = status !== undefined ? ERROR_MAP[status] : null
  const title = entry?.title ?? 'Erro no servidor'
  const description = message ?? entry?.defaultMessage ?? 'Ocorreu um erro inesperado. Tente novamente mais tarde.'

  return (
    <div data-testid="error-state" role="alert">
      <div aria-hidden="true" className="error-state-icon" />
      <h2>{title}</h2>
      <p>{description}</p>
      {correlationId && (
        <p data-testid="correlation-id" className="correlation-id">
          ID de correlação: {correlationId}
        </p>
      )}
      <div className="error-state-actions">
        {isServerError && onRetry && (
          <button onClick={onRetry} type="button">
            Tentar novamente
          </button>
        )}
        {status === 401 && logout && (
          <button onClick={logout} type="button">
            Fazer login
          </button>
        )}
      </div>
    </div>
  )
}
