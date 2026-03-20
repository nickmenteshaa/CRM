"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Something went wrong" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center p-4">
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] shadow-sm p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-[#F9FAFB] mb-2">Something went wrong</h2>
            <p className="text-sm text-[#9CA3AF] mb-4">{this.state.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                window.location.reload();
              }}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
