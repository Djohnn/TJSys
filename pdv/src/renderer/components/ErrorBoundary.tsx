import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '0 auto',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: '#fce4ec', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 24px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="#c62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
            Algo deu errado
          </h2>
          <p style={{ color: '#757575', marginBottom: '24px', fontSize: '0.875rem' }}>
            {this.state.error?.message || 'Ocorreu um erro inesperado ao carregar esta página.'}
          </p>
          <button onClick={this.handleRetry}
            style={{
              padding: '12px 24px', background: '#1976d2', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 500,
            }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
