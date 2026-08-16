import type { ImgHTMLAttributes, ReactNode } from 'react'
import { logoAssets } from '@/design-system/tokens'

export type LogoVariant = keyof typeof logoAssets

export interface LogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  variant?: LogoVariant
  alt?: string
}

export function Logo({ variant = 'blue', alt = 'TJSys', className = '', ...props }: LogoProps): ReactNode {
  return <img src={logoAssets[variant]} alt={alt} className={`h-8 w-auto ${className}`} {...props} />
}

export default Logo
