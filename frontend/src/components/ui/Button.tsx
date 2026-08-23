import type { ReactNode, ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const base = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--color-primary-800)] text-white hover:bg-[var(--color-primary-900)] active:bg-[var(--color-primary-900)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-white)] text-[var(--color-gray-800)] hover:bg-[var(--color-gray-200)] active:bg-[var(--color-gray-300)]',
  danger: 'bg-[var(--color-danger-600)] text-white hover:bg-[var(--color-danger-700)] active:bg-[var(--color-danger-900)]',
  ghost: 'text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)] active:bg-[var(--color-gray-300)]',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
}

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }: ButtonProps): ReactNode {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

export default Button
