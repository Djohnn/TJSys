export const colors = {
  brand: 'var(--color-brand)',
  surface: 'var(--color-surface)',
  text: 'var(--color-text)',
  danger: 'var(--color-danger)',
  background: 'var(--color-background)',
  border: 'var(--color-border)',
  textMuted: 'var(--color-text-muted)',
  white: 'var(--color-white)',
  primary: {
    900: 'var(--color-primary-900)',
    800: 'var(--color-primary-800)',
    700: 'var(--color-primary-700)',
    600: 'var(--color-primary-600)',
    500: 'var(--color-primary-500)',
    100: 'var(--color-primary-100)',
    50: 'var(--color-primary-50)',
  },
  success: {
    950: 'var(--color-success-950)',
    900: 'var(--color-success-900)',
    800: 'var(--color-success-800)',
    700: 'var(--color-success-700)',
    600: 'var(--color-success-600)',
    500: 'var(--color-success-500)',
    100: 'var(--color-success-100)',
    50: 'var(--color-success-50)',
  },
  info: {
    700: 'var(--color-info-700)',
    600: 'var(--color-info-600)',
    100: 'var(--color-info-100)',
    50: 'var(--color-info-50)',
  },
  warning: {
    800: 'var(--color-warning-800)',
    600: 'var(--color-warning-600)',
    100: 'var(--color-warning-100)',
    50: 'var(--color-warning-50)',
  },
  alert: {
    800: 'var(--color-alert-800)',
    600: 'var(--color-alert-600)',
    100: 'var(--color-alert-100)',
    50: 'var(--color-alert-50)',
  },
  critical: {
    900: 'var(--color-critical-900)',
    800: 'var(--color-critical-800)',
    100: 'var(--color-critical-100)',
  },
  gray: {
    900: 'var(--color-gray-900)',
    800: 'var(--color-gray-800)',
    700: 'var(--color-gray-700)',
    600: 'var(--color-gray-600)',
    500: 'var(--color-gray-500)',
    400: 'var(--color-gray-400)',
    300: 'var(--color-gray-300)',
    200: 'var(--color-gray-200)',
    100: 'var(--color-gray-100)',
  },
  module: {
    vendas: 'var(--color-module-vendas)',
    financeiro: 'var(--color-module-financeiro)',
    compras: 'var(--color-module-compras)',
    estoque: 'var(--color-module-estoque)',
    fiscal: 'var(--color-module-fiscal)',
    pessoas: 'var(--color-module-pessoas)',
    relatorios: 'var(--color-module-relatorios)',
    admin: 'var(--color-module-admin)',
  },
} as const

export const typography = {
  family: 'var(--font-family-sans)',
  body: 'var(--font-size-md)',
  xs: 'var(--font-size-xs)',
  sm: 'var(--font-size-sm)',
  lg: 'var(--font-size-lg)',
  xl: 'var(--font-size-xl)',
  '2xl': 'var(--font-size-2xl)',
  '3xl': 'var(--font-size-3xl)',
} as const

export const spacing = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  8: 'var(--space-8)',
  10: 'var(--space-10)',
  12: 'var(--space-12)',
} as const

export const radii = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
} as const

export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const

export const focus = {
  ring: 'var(--focus-ring)',
  offset: 'var(--focus-ring-offset)',
} as const

export const states = {
  error: {
    text: 'var(--color-danger-900)',
    border: 'var(--color-danger-600)',
    surface: 'var(--color-danger-50)',
  },
  success: {
    text: 'var(--color-success-900)',
    border: 'var(--color-success-700)',
    surface: 'var(--color-success-50)',
  },
  warning: {
    text: 'var(--color-warning-800)',
    border: 'var(--color-warning-600)',
    surface: 'var(--color-warning-50)',
  },
  info: {
    text: 'var(--color-info-700)',
    border: 'var(--color-info-600)',
    surface: 'var(--color-info-50)',
  },
} as const

export const logoAssets = {
  blue: '/assets/brand/logo_fundo_azul.png.png',
  white: '/assets/brand/logo_fundo_branco.png.png',
} as const
