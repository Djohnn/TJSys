import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function Input({ label, id, ...props }: InputProps) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-label={label} {...props} />
    </div>
  )
}