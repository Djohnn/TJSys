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
      className="runbook-link"
    >
      {label}
    </a>
  )
}