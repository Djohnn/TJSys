import type { ReactNode } from 'react'

export type AlertVariant = 'success' | 'info' | 'warning' | 'error'

export interface AlertProps {
  variant?: AlertVariant
  title: string
  children: ReactNode
  className?: string
}

const variantStyles: Record<AlertVariant, string> = {
  success: 'border-[var(--color-success-700)] bg-[var(--color-success-50)] text-[var(--color-success-900)]',
  info: 'border-[var(--color-info-600)] bg-[var(--color-info-50)] text-[var(--color-info-700)]',
  warning: 'border-[var(--color-warning-600)] bg-[var(--color-warning-50)] text-[var(--color-warning-800)]',
  error: 'border-[var(--color-danger-600)] bg-[var(--color-danger-50)] text-[var(--color-danger-900)]',
}

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps): ReactNode {
  return (
    <div role="alert" aria-label={title} className={`rounded-[var(--radius-md)] border p-4 ${variantStyles[variant]} ${className}`}>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  )
}

export default Alert
