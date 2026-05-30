import React from 'react';

type Props = {children: React.ReactNode};
type State = {error: Error | null};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white/5 border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold text-rose-400 mb-2">Une erreur est survenue</h2>
            <p className="text-sm text-zinc-400 mb-6 break-words">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({error: null})}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
