import type { ReactNode } from 'react'

interface LoadingStateProps {
  lines?: number
  message?: string
}

export default function LoadingState({ lines = 3, message = 'Carregando\u2026' }: LoadingStateProps): ReactNode {
  return (
    <div data-testid="loading-state" className="p-6 flex flex-col items-center gap-4">
      {message && <p className="text-sm text-neutral-700">{message}</p>}
      <div className="space-y-3 w-full max-w-md animate-pulse">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 rounded bg-neutral-200 w-full" />
        ))}
      </div>
    </div>
  )
}
