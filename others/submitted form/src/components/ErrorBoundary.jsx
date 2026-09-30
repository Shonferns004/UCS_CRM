import { Component } from 'react'

// If a render throws and nothing catches it, React unmounts the entire tree.
// For this form that means a blank white page, and a volunteer who cannot tell
// whether the document choice or signature they just made was lost. Catching it
// lets us say something honest and offer a way forwardabc.
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // There is no error-reporting service wired up in this app, so this is the
    // only place the cause is recorded. The message is also rendered below so a
    // volunteer can read it out to whoever supports the Trust.
    console.error('Submitted form crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="sf-page">
        <div className="sf-auth-card">
          <h1 className="sf-h1">Something went wrong</h1>
          <p className="sf-muted">
            This form stopped unexpectedly. Reload the page to carry on — anything you
            already saved is stored on the server and will be loaded again.
          </p>
          <p className="sf-crash-ref">{this.state.error?.message}</p>
          <div className="sf-actions">
            <button
              type="button"
              className="sf-btn sf-btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload the form
            </button>
          </div>
        </div>
      </div>
    )
  }
}
