import type { ReactNode } from 'react'

interface RunbookLinkProps {
  label: string
  url: string
  testId?: string
}

export default function RunbookLink({ label, url, testId }: RunbookLinkProps): ReactNode {
  return (
    <a
      data-testid={testId ?? 'runbook-link'}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-3 bg-surface rounded-xl border border-border text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors"
    >
      {label}
    </a>
  )
}