import type { ReactNode } from 'react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  testId?: string
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--color-success-100)] text-[var(--color-success-900)]',
  warning: 'bg-[var(--color-warning-100)] text-[var(--color-warning-800)]',
  danger: 'bg-[var(--color-danger-100)] text-[var(--color-danger-900)]',
  info: 'bg-[var(--color-info-100)] text-[var(--color-info-700)]',
  neutral: 'bg-[var(--color-gray-200)] text-[var(--color-gray-600)]',
}

export function Badge({ children, variant = 'neutral', testId, className = '' }: BadgeProps): ReactNode {
  return (
    <span data-testid={testId} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[variant]} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
