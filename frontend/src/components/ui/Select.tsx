import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  options?: readonly SelectOption[]
  error?: string
  helperText?: string
}

export function Select({ label, id, options, error, helperText, className = '', children, ...props }: SelectProps): ReactNode {
  const generatedId = useId()
  const selectId = id ?? `select-${generatedId.replace(/:/g, '')}`
  const helpId = `${selectId}-help`
  const errorId = `${selectId}-error`
  const describedBy = [helperText ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-[var(--color-gray-700)]">{label}</label>
      <select
        id={selectId}
        className={`min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] disabled:cursor-not-allowed disabled:bg-[var(--color-gray-200)] ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        {children}
      </select>
      {helperText && <p id={helpId} className="text-sm text-[var(--color-text-muted)]">{helperText}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-[var(--color-danger-900)]">{error}</p>}
    </div>
  )
}

export default Select
