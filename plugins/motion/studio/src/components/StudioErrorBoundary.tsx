import { Component, type ErrorInfo, type ReactNode } from "react";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { CrashFeedbackPrompt } from "./feedback/CrashFeedbackPrompt";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Studio] Uncaught error:", error, info.componentStack);
    trackStudioEvent("crash", {
      error_message: error.message,
      error_name: error.name,
      stack_trace: error.stack?.slice(0, 4000) ?? null,
      component_stack: info.componentStack?.slice(0, 2000) ?? null,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950 font-sans text-neutral-200">
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="max-w-[480px] text-center text-[13px] text-neutral-500">
          {this.state.error.message}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover active:scale-[0.98]"
          >
            Try again
          </button>
          {/* If the error recurs immediately, "Try again" loops — a full reload
              is the recovery path that always works. */}
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-neutral-700 px-5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 active:scale-[0.98]"
          >
            Reload Studio
          </button>
        </div>
        {/* The crash report tells us what broke; only the user can tell us what
            they were doing when it did. This is also the one screen where they
            have nothing else to get on with. */}
        <div className="mt-6">
          <CrashFeedbackPrompt />
        </div>
      </div>
    );
  }
}
