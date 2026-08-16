import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function Card({ title, children, className = '', actions }: CardProps): ReactNode {
  return (
    <div data-testid="card" className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          {title && <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}

export default Card
