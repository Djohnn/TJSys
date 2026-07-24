import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ title, description, action }: EmptyStateProps): ReactNode {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-3xl">?</div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-neutral-500 mb-4 max-w-md">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}
