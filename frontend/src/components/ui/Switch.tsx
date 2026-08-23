import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  description?: string
}

export function Switch({ label, description, id, className = '', ...props }: SwitchProps): ReactNode {
  const generatedId = useId()
  const switchId = id ?? `switch-${generatedId.replace(/:/g, '')}`
  const descriptionId = `${switchId}-description`

  return (
    <label htmlFor={switchId} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 py-1 focus-within:ring-2 focus-within:ring-[var(--color-primary-800)] ${props.disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <input
        {...props}
        id={switchId}
        type="checkbox"
        role="switch"
        aria-describedby={description ? descriptionId : undefined}
        className={`size-5 accent-[var(--color-primary-800)] ${className}`}
      />
      <span>
        <span className="block text-sm font-medium text-[var(--color-gray-800)]">{label}</span>
        {description && <span id={descriptionId} className="block text-sm text-[var(--color-text-muted)]">{description}</span>}
      </span>
    </label>
  )
}

export default Switch
