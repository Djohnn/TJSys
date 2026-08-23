import type { ReactNode } from 'react'

interface TableProps {
  headers: string[]
  rows: ReactNode[][]
  testId?: string
}

export function Table({ headers, rows, testId = 'data-table' }: TableProps): ReactNode {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]" data-testid={testId}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-200)]">
            {headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-[var(--color-gray-700)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-primary-50)] last:border-0" data-testid={`${testId}-row`}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 text-[var(--color-gray-800)]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Table
