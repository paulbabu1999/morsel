import React from "react";

/**
 * App-wide safety net. A render error in any screen (e.g. an unexpected null
 * from the API) shows a recoverable message instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            maxWidth: 520,
            margin: "18vh auto",
            padding: 28,
            textAlign: "center",
            display: "grid",
            gap: 14,
            justifyItems: "center",
          }}
        >
          <h2 style={{ margin: 0 }}>Something went wrong on this screen.</h2>
          <p style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 13 }}>
            {this.state.error.message}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
