import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Called so the app can clear the dataset that caused the failure. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Catches render-time exceptions inside the dashboard. Without this, one bad
 * row or chart shape would blank the whole tab ("Aw, Snap") with no recovery.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[Dashboard] render error caught:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private handleRetry = () => {
    this.setState({ error: null, info: null });
  };

  private handleClearData = () => {
    this.props.onReset?.();
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-rose-200 dark:bg-slate-900 dark:ring-rose-900/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/60">
            <AlertTriangle className="h-7 w-7 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
            This view hit a problem
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your files are still loaded. Retry the view, or clear the loaded files to start fresh.
          </p>
          <p className="mx-auto mt-3 max-w-lg break-words rounded-lg bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {error.message || 'Unknown error'}
          </p>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              <RotateCcw className="h-4 w-4" />
              Retry view
            </button>
            <button
              type="button"
              onClick={this.handleClearData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Trash2 className="h-4 w-4" />
              Clear loaded files
            </button>
          </div>

          {info && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                Technical details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-400">
                {info}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
