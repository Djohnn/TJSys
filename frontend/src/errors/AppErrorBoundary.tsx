import { Component, type ErrorInfo, type ReactNode } from 'react'

import ErrorState from './ErrorState'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary] Uncaught error:', error.message, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary">
          <ErrorState message="Algo deu errado. Tente recarregar a página." />
        </div>
      )
    }

    return this.props.children
  }
}
