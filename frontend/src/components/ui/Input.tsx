import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
}

export function Input({ label, id, error, helperText, className = '', ...props }: InputProps): ReactNode {
  const generatedId = useId()
  const inputId = id ?? `input-${generatedId.replace(/:/g, '')}`
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const describedBy = [helperText ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-gray-700)]">
        {label}
      </label>
      <input
        id={inputId}
        className={`min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {helperText && <p id={helpId} className="text-sm text-[var(--color-text-muted)]">{helperText}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-[var(--color-danger-900)]">{error}</p>}
    </div>
  )
}

export default Input
