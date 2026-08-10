import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Card({ children, style, className }: CardProps) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      border: '1px solid #f0f0f0',
      ...style
    }} className={className}>
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', ...style }}>
      {children}
    </div>
  );
}

export function CardContent({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: '24px', ...style }}>{children}</div>;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
  style,
  className,
  ...props
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '8px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    ...style
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '8px 16px', fontSize: '0.8125rem' },
    md: { padding: '12px 24px', fontSize: '0.875rem' },
    lg: { padding: '16px 32px', fontSize: '1rem' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: '#1976d2', color: '#fff' },
    secondary: { backgroundColor: '#fff', color: '#333', border: '1px solid #e0e0e0' },
    outline: { backgroundColor: 'transparent', color: '#1976d2', border: '2px solid #1976d2' },
    danger: { backgroundColor: '#d32f2f', color: '#fff' },
    success: { backgroundColor: '#388e3c', color: '#fff' },
  };

  const variantStyle = variantStyles[variant] || variantStyles.primary;
  const sizeStyle = sizeStyles[size] || sizeStyles.md;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{
        ...baseStyles,
        ...variantStyle,
        ...sizeStyle,
        width: fullWidth ? '100%' : 'auto',
        ...(loading && { position: 'relative', color: 'transparent' })
      }}
      {...props}
    >
      {loading && (
        <span style={{
          position: 'absolute',
          width: '18px',
          height: '18px',
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      )}
      <span style={{ opacity: loading ? 0 : 1 }}>{children}</span>
    </button>
  );
}

interface InputGroupProps {
  label?: string;
  error?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function InputGroup({ label, error, children, style }: InputGroupProps) {
  return (
    <div style={{ marginBottom: '16px', ...style }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#212121',
          marginBottom: '8px'
        }}>
          {label}
        </label>
      )}
      {children}
      {error && (
        <div style={{
          color: '#c62828',
          fontSize: '0.75rem',
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  return (
    <InputGroup label={label} error={error} style={error ? { borderColor: '#ef9a9a' } : style}>
      <input
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: '1rem',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          backgroundColor: '#fff',
          color: '#212121',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          outline: 'none',
          ...style
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = '#1976d2'}
        onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
        {...props}
      />
    </InputGroup>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, children, title, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { maxWidth: '400px' },
    md: { maxWidth: '600px' },
    lg: { maxWidth: '800px' },
    xl: { maxWidth: '1000px' },
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '24px',
      animation: 'fadeIn 0.2s ease'
    }} onClick={onClose}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.3s ease',
        ...sizeStyles[size]
      }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>
            <button onClick={onClose} style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: '#757575',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}
        <div style={{ padding: '24px', maxHeight: 'calc(90vh - 72px)', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md' }: SpinnerProps) {
  const sizes = { sm: 16, md: 24, lg: 40 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={sizes[size]} height={sizes[size]} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="31.4 31.4" />
      </svg>
    </div>
  );
}

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  const colors = {
    success: { bg: '#e8f5e9', border: '#2e7d32', icon: '✓' },
    error: { bg: '#fce4ec', border: '#c62828', icon: '✕' },
    warning: { bg: '#fff3e0', border: '#f57c00', icon: '⚠' },
    info: { bg: '#e3f2fd', border: '#1976d2', icon: 'ℹ' }
  };

  const style = colors[type];

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 1001,
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: '8px',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      animation: 'slideIn 0.3s ease',
      maxWidth: '400px'
    }}>
      <span style={{
        fontSize: '1.25rem',
        color: style.border,
        fontWeight: 'bold'
      }}>{style.icon}</span>
      <span style={{ flex: 1, color: '#212121' }}>{message}</span>
      <button onClick={onClose} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#757575',
        padding: '4px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#757575' }}>
      <div style={{ marginBottom: '16px', opacity: 0.5 }}>{icon}</div>
      <h3 style={{ margin: '16px 0 8px', fontSize: '1.125rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ color: '#757575', marginBottom: '24px' }}>{description}</p>
      {action && (
        <button onClick={action.onClick} style={{
          background: '#1976d2',
          color: '#fff',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: 'pointer'
        }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

interface TableProps {
  children: React.ReactNode;
  striped?: boolean;
  hoverable?: boolean;
}

export function Table({ children }: TableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        {children}
      </table>
    </div>
  );
}
