import type { ReactNode } from 'react'

export default function LoadingState({
  message = 'Carregando…',
}: {
  message?: string
}): ReactNode {
  return (
    <div data-testid="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}
