import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      let isGeminiError = false;
      
      try {
        const errorMsg = this.state.error?.message || "";
        if (errorMsg.includes("Gemini API access is blocked")) {
          isGeminiError = true;
          errorMessage = errorMsg;
        } else if (errorMsg.includes("Quota limit exceeded")) {
          errorMessage = "Daily database limit reached. This is a free-tier restriction and will automatically reset at midnight. We've optimized the app to prevent this, but high traffic has temporarily paused access.";
        } else {
          const parsedError = JSON.parse(errorMsg);
          if (parsedError.error) {
            errorMessage = `Firestore Error: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 text-center">
          <div className="max-w-xl bg-zinc-900/50 backdrop-blur-2xl p-12 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-8">
              {isGeminiError ? <Sparkles className="w-10 h-10 text-accent" /> : <ShieldCheck className="w-10 h-10 text-accent" />}
            </div>
            <h2 className="text-3xl font-serif font-black mb-4 uppercase tracking-tighter">
              {isGeminiError ? 'AI Vision Interrupted' : 'A Classical Interruption'}
            </h2>
            <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-8">
              <p className="text-gray-300 text-sm leading-relaxed font-medium">{errorMessage}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-gray-200 transition-all"
              >
                Reload Gallery
              </button>
              {isGeminiError && (
                <button 
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="px-8 py-4 bg-accent text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-accent/90 transition-all"
                >
                  Dismiss & Continue
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
