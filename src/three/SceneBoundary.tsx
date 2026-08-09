import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onError: (message: string) => void
}

/**
 * React unmounts a failed subtree silently, and inside a canvas that looks
 * exactly like a working renderer drawing nothing. This turns a scene error
 * into something the player is told about and the console records.
 */
export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Little Lines] the 3D scene failed to render', error, info.componentStack)
    this.props.onError(error.message)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
