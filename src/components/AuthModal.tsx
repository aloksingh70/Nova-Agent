import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AuthUser } from '../types/nova';
import { NovaLogo } from './NovaLogo';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

interface GoogleProviderStatus {
  id: 'google';
  name: string;
  configured: boolean;
  callbackUrl: string;
  envVars: [string, string];
}

interface OAuthSetupNotice {
  message: string;
  redirectUri?: string;
  envVars?: string[];
}

const GoogleLogo: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);

  const [googleStatus, setGoogleStatus] = useState<GoogleProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<OAuthSetupNotice | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Load non-sensitive Google OAuth provider status on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/providers');
        if (!res.ok) return;
        const data = (await res.json()) as { providers?: GoogleProviderStatus[] };
        if (!active || !Array.isArray(data.providers)) return;
        const google = data.providers.find((p) => p.id === 'google') ?? null;
        setGoogleStatus(google);
      } catch {
        // Ignore transient status fetch failure; button still queries server on click
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Listen for Google OAuth popup completion via postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin || '';
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          const data = await res.json();
          if (data.user) {
            onSuccess(data.user);
          } else {
            setError('Google sign-in completed, but session could not be restored. Please try again.');
          }
        } catch {
          setError('Signed in with Google, but failed to load profile.');
        } finally {
          setOauthLoading(false);
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setError(event.data?.error || 'Google sign-in was cancelled.');
        setOauthLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setManualLoading(true);

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = mode === 'register' ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.user) {
        setError(data.error || `${mode === 'register' ? 'Registration' : 'Login'} failed. Please try again.`);
        return;
      }

      onSuccess(data.user);
    } catch {
      setError('Unable to connect to authentication server. Please check your connection.');
    } finally {
      setManualLoading(false);
    }
  };

  const handleGoogleContinue = async () => {
    setError(null);
    setSetupNotice(null);
    setCopiedUri(false);
    setOauthLoading(true);

    try {
      const res = await fetch('/api/auth/oauth/google/url', { credentials: 'include' });
      const data = (await res.json()) as {
        url?: string | null;
        error?: string;
        redirectUri?: string;
        envVars?: string[];
      };

      if (!res.ok || !data.url) {
        setSetupNotice({
          message:
            data.error ||
            'Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables to enable Google sign-in.',
          redirectUri: data.redirectUri || googleStatus?.callbackUrl,
          envVars: data.envVars || ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        });
        setOauthLoading(false);
        return;
      }

      // Open Google's OAuth authorization URL directly in a popup
      const popup = window.open(
        data.url,
        'nova_oauth_google',
        'width=560,height=680,noopener=no'
      );
      if (!popup) {
        setError('Popup was blocked by your browser. Allow popups to continue with Google sign-in.');
        setOauthLoading(false);
        return;
      }

      // Reset loading indicator if user manually closes the popup without completing sign-in
      const pollId = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollId);
          setOauthLoading(false);
        }
      }, 600);
    } catch {
      setError('Unable to reach authentication server.');
      setOauthLoading(false);
    }
  };

  const handleCopyRedirectUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopiedUri(true);
      window.setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-auth-title"
      data-testid="oauth-auth-modal"
      className="fixed inset-0 z-50 bg-[#141414]/45 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="corner-brackets w-full max-w-[440px] bg-[#efece6] border border-[#141414]/30 text-[#141414] shadow-xl my-auto">
        <span className="cb-tl" />
        <span className="cb-tr" />
        <span className="cb-bl" />
        <span className="cb-br" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#141414]/15">
          <NovaLogo />
          <button
            type="button"
            aria-label="Close authentication modal"
            onClick={onClose}
            className="p-1.5 text-[#141414]/60 hover:text-[#141414] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Header Title */}
          <div className="space-y-1">
            <h2 id="nova-auth-title" className="text-[20px] font-medium tracking-[-0.02em]">
              {mode === 'login' ? 'Sign in to NOVA Studio' : 'Create your NOVA Account'}
            </h2>
            <p className="text-[13px] text-[#141414]/65 leading-[1.45]">
              {mode === 'login'
                ? 'Sign in to run AI SQL prompts and access your saved query threads.'
                : 'Create an account to start writing, debugging, and optimizing SQL queries.'}
            </p>
          </div>

          {/* Mode Tabs (Sign In / Create Account) */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#141414]/5 border border-[#141414]/15">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-1.5 text-[11px] font-mono-label transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#141414] text-[#efece6] shadow-xs'
                  : 'text-[#141414]/70 hover:text-[#141414]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-1.5 text-[11px] font-mono-label transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#141414] text-[#efece6] shadow-xs'
                  : 'text-[#141414]/70 hover:text-[#141414]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 border border-[#dc2626]/40 bg-[#dc2626]/10 text-[#991b1b] text-[12.5px] leading-[1.45]"
            >
              {error}
            </div>
          )}

          {/* Manual Login / Register Form */}
          <form onSubmit={handleManualAuth} className="space-y-3">
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="block font-mono-label text-[10px] text-[#141414]/75">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full h-9 px-3 border border-[#141414]/25 bg-[#efece6] text-[#141414] placeholder-[#141414]/40 text-[13px] focus:outline-none focus:border-[#141414] transition-colors"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block font-mono-label text-[10px] text-[#141414]/75">
                Email Address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full h-9 px-3 border border-[#141414]/25 bg-[#efece6] text-[#141414] placeholder-[#141414]/40 text-[13px] focus:outline-none focus:border-[#141414] transition-colors"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block font-mono-label text-[10px] text-[#141414]/75">
                  Password
                </label>
                {mode === 'register' && (
                  <span className="font-mono text-[9px] text-[#141414]/50">Min 6 characters</span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Choose a password' : 'Enter your password'}
                  className="w-full h-9 pl-3 pr-10 border border-[#141414]/25 bg-[#efece6] text-[#141414] placeholder-[#141414]/40 text-[13px] focus:outline-none focus:border-[#141414] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#141414]/50 hover:text-[#141414] transition-colors p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={manualLoading}
              className="w-full h-10 px-4 mt-1 border border-[#141414] bg-[#141414] text-[#efece6] hover:bg-[#2a2928] text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span>
                {manualLoading
                  ? mode === 'login'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
              </span>
              {!manualLoading && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#141414]/15" />
            </div>
            <span className="relative px-2.5 bg-[#efece6] font-mono-label text-[9px] text-[#141414]/50 uppercase tracking-widest">
              or continue with
            </span>
          </div>

          {/* Google OAuth Sign-In Option */}
          <div aria-label="Google OAuth sign-in">
            <button
              type="button"
              data-testid="oauth-btn-google"
              disabled={oauthLoading}
              onClick={handleGoogleContinue}
              className="w-full h-10 px-4 border border-[#141414]/25 bg-[#f6f4ef] hover:bg-[#efece6] hover:border-[#141414] text-[#141414] text-[13px] font-medium flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2.5">
                <GoogleLogo />
                <span>{oauthLoading ? 'Connecting Google...' : 'Continue with Google'}</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-50 shrink-0" aria-hidden="true" />
            </button>
          </div>

          {/* Google Setup Notice (only if user clicked Google and it's not configured) */}
          {setupNotice && (
            <div
              role="status"
              data-testid="oauth-setup-notice"
              className="p-3 border border-[#141414]/20 bg-[#f6f4ef] text-[#141414] space-y-2 text-[12px] leading-[1.45]"
            >
              <div className="font-mono-label text-[9.5px] text-[#141414]/75">
                Google OAuth Setup Info
              </div>
              <p className="text-[#141414]/85">{setupNotice.message}</p>

              {setupNotice.envVars && setupNotice.envVars.length > 0 && (
                <div className="font-mono text-[10.5px] text-[#141414]/75">
                  Env vars: <code className="text-[#141414]">{setupNotice.envVars.join(', ')}</code>
                </div>
              )}

              {setupNotice.redirectUri && (
                <div className="space-y-1">
                  <div className="font-mono-label text-[9px] text-[#141414]/60">
                    Authorized Callback URL
                  </div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 min-w-0 truncate px-2 py-1 bg-[#efece6] border border-[#141414]/20 font-mono text-[10.5px] text-[#141414]">
                      {setupNotice.redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyRedirectUri(setupNotice.redirectUri!)}
                      className="h-7 px-2 border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9px] inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      {copiedUri ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUri ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Switcher */}
          <div className="text-center pt-1">
            <p className="text-[12px] text-[#141414]/65">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                }}
                className="font-medium text-[#141414] underline hover:no-underline cursor-pointer ml-1"
              >
                {mode === 'login' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          </div>

          {/* Footer Security Note */}
          <div className="pt-3 border-t border-[#141414]/15 flex items-start gap-2 text-[11.5px] text-[#141414]/60 leading-[1.4]">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#141414]/75" aria-hidden="true" />
            <p>
              Secured with scrypt password hashing, Google OAuth 2.0, and HttpOnly session cookies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
