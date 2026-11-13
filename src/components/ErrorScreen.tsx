import { Component, type ReactNode } from 'react'

interface Props {
  // Deletes the saved state; the page reloads after it.
  onReset: () => void
  // Reloads the page; the browser's own reload when left out.
  onReload?: () => void
  children: ReactNode
}

interface State {
  failed: boolean
  confirming: boolean
}

// Catches a crash anywhere in the app and shows a way out in place of a blank page: reload, or, after a
// second press, delete the saved state (a malformed one would crash every load) and reload.
export default class ErrorScreen extends Component<Props, State> {
  state: State = { failed: false, confirming: false }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const reload = this.props.onReload ?? (() => window.location.reload())
    return (
      <main className="error-screen">
        <div className="card">
          <h1 role="alert">Something went wrong</h1>
          <p>Movie Nite hit an error and can't go on. Reloading usually fixes it.</p>
          <p>
            If the error comes back after a reload, the saved data may be damaged. Resetting deletes the roster,
            tonight's films and every setting in this browser.
          </p>
          <div className="error-screen-actions">
            <button type="button" className="primary" onClick={reload}>
              Reload
            </button>
            {this.state.confirming ? (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  this.props.onReset()
                  reload()
                }}
              >
                Delete everything and reload
              </button>
            ) : (
              <button type="button" className="quiet" onClick={() => this.setState({ confirming: true })}>
                Reset saved data…
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }
}
