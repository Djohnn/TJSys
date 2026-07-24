import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export default function Card({ title, children, className = '', actions }: CardProps): ReactNode {
  return (
    <div data-testid="card" className={`bg-surface rounded-xl border border-border shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
