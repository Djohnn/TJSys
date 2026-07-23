import type { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  status?: 'good' | 'warning' | 'critical'
  subtitle?: string
}

export default function MetricCard({ title, value, status, subtitle }: MetricCardProps): ReactNode {
  let statusClass = ''
  if (status === 'good') statusClass = 'metric-good'
  else if (status === 'warning') statusClass = 'metric-warning'
  else if (status === 'critical') statusClass = 'metric-critical'

  return (
    <div data-testid="metric-card" className={`metric-card ${statusClass}`}>
      <span className="metric-title">{title}</span>
      <span className="metric-value">{value}</span>
      {subtitle && <span className="metric-subtitle">{subtitle}</span>}
    </div>
  )
}