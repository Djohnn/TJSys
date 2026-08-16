import type { ReactNode } from 'react'

interface SkeletonProps {
  className?: string
  lines?: number
}

export default function Skeleton({ className = 'h-4 w-full', lines = 3 }: SkeletonProps): ReactNode {
  return (
    <div data-testid="skeleton" className="space-y-3 animate-pulse">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`rounded bg-[var(--color-gray-200)] ${className}`} />
      ))}
    </div>
  )
}
