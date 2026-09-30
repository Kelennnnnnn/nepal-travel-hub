import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/** The actual "something broke" UI — pulled out so both this class
 *  component's own fallback AND Sentry's ErrorBoundary (which wraps the
 *  whole app in main.tsx, catching what this one no longer needs to at
 *  the top level) can render the identical screen. */
export function ErrorFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground">{error?.message}</p>
        <Button onClick={onReset}>Try Again</Button>
      </div>
    </div>
  );
}

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

/** A plain (non-Sentry) boundary for nesting anywhere other than the app
 *  root — e.g. around a single risky widget, where reloading the whole
 *  page on error would be too heavy-handed. The app root itself uses
 *  Sentry.ErrorBoundary (main.tsx) instead, with ErrorFallback as its
 *  render prop, so the root boundary both reports to Sentry AND shows
 *  this same UI. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <ErrorFallback
          error={this.state.error}
          onReset={() => { this.setState({ hasError: false }); window.location.reload(); }}
        />
      );
    }
    return this.props.children;
  }
}
