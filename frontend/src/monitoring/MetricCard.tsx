import type { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  status?: 'good' | 'warning' | 'critical'
  subtitle?: string
}

const statusBorder: Record<string, string> = {
  good: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  critical: 'border-l-red-500',
}

export default function MetricCard({ title, value, status, subtitle }: MetricCardProps): ReactNode {
  return (
    <div
      data-testid="metric-card"
      className={`bg-surface rounded-xl border border-border shadow-sm p-4 border-l-4 ${status ? statusBorder[status] : 'border-l-transparent'}`}
    >
      <span className="block text-xs font-medium text-neutral-500 uppercase tracking-wide">{title}</span>
      <span className="block mt-1 text-xl font-bold text-neutral-900">{value}</span>
      {subtitle && <span className="block mt-1 text-xs text-neutral-500">{subtitle}</span>}
    </div>
  )
}