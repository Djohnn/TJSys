import type { ReactNode } from 'react'

interface TableProps {
  headers: string[]
  rows: ReactNode[][]
  testId?: string
}

export default function Table({ headers, rows, testId = 'data-table' }: TableProps): ReactNode {
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid={testId}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-50 border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors" data-testid={`${testId}-row`}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 text-neutral-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
