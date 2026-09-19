import { Component, type ReactNode } from "react";

/**
 * Without this, one throw takes the whole page white.
 *
 * The app does arithmetic on strings that come off the chain - `BigInt(pool)`,
 * `BigInt(position.yes)` - and a read that comes back in an unexpected shape
 * throws during render rather than returning an error to a query. React unmounts
 * the tree on an uncaught render error, so the result is a blank document with
 * the answer only in the console.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[cassandra] render failed:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6">
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted">
          Something broke
        </span>
        <h1 className="mt-3 font-display text-2xl text-ink">This page could not be rendered.</h1>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-soft">
          Nothing on chain was touched — this is the app failing to draw, not a transaction going
          wrong. The most common cause is a contract read returning something unexpected, which
          usually means the wrong network is selected.
        </p>
        <pre className="mt-4 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-surface p-3 font-mono text-[0.72rem] text-muted">
          {String(error?.message ?? error).slice(0, 400)}
        </pre>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-sm border border-ink bg-ink px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-paper"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-sm border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted hover:text-ink"
          >
            Back to the start
          </a>
        </div>
      </div>
    );
  }
}
