"use client";

import { createClientLogger } from "@/lib/logger/client";
import React from "react";

const logger = createClientLogger({ component: "ErrorBoundary" });

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("Error Boundary caught", {
      error: String(error),
      errorInfo: String(errorInfo),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full w-full items-center justify-center p-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <button
                className="mt-4 rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
