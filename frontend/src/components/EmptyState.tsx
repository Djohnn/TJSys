import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div data-testid="empty-state">
      <div aria-hidden="true" className="empty-state-icon" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
