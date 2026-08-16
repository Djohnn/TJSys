import { useId } from 'react'
import type { ReactNode, TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  helperText?: string
}

export function Textarea({ label, id, error, helperText, className = '', ...props }: TextareaProps): ReactNode {
  const generatedId = useId()
  const textareaId = id ?? `textarea-${generatedId.replace(/:/g, '')}`
  const helpId = `${textareaId}-help`
  const errorId = `${textareaId}-error`
  const describedBy = [helperText ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <label htmlFor={textareaId} className="block text-sm font-medium text-[var(--color-gray-700)]">{label}</label>
      <textarea
        id={textareaId}
        className={`min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] disabled:cursor-not-allowed disabled:bg-[var(--color-gray-200)] ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {helperText && <p id={helpId} className="text-sm text-[var(--color-text-muted)]">{helperText}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-[var(--color-danger-900)]">{error}</p>}
    </div>
  )
}

export default Textarea
