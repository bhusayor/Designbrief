// ────────────────────────────────────────────────────────────────────
// AppErrorBoundary — top-level crash guard. Before this existed, any
// uncaught render error white-screened the entire app with nothing
// but a console stack. Now the user gets a reload card and the error
// is logged with the section they were on.
//
// Class component because error boundaries still require the class
// lifecycle (getDerivedStateFromError / componentDidCatch).
// ────────────────────────────────────────────────────────────────────

import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg, #fff)',
        color: 'var(--color-text, #111)',
        fontFamily: "'Urbanist', -apple-system, sans-serif",
        padding: 24,
      }}>
        <div style={{
          maxWidth: 440, textAlign: 'center',
          background: 'var(--color-card, #fff)',
          border: '1px solid var(--color-border, #eaeaea)',
          borderRadius: 16, padding: '36px 32px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>
            Something broke
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-muted, #6f6f6f)', margin: '0 0 20px' }}>
            The app hit an unexpected error. Your work is saved as of the
            last autosave. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px',
              background: 'var(--color-primary, #0f0f0f)',
              color: 'var(--color-primary-text, #fff)',
              border: 'none', borderRadius: 10,
              font: '700 14px Urbanist, sans-serif',
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
          {this.state.error?.message && (
            <div style={{
              marginTop: 18, padding: '10px 12px',
              background: 'var(--color-surface, #f7f8fa)',
              borderRadius: 8,
              font: '500 11px monospace',
              color: 'var(--color-text-muted, #6f6f6f)',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}>
              {String(this.state.error.message).slice(0, 300)}
            </div>
          )}
        </div>
      </div>
    )
  }
}
