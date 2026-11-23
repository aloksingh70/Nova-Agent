import React, { useState } from 'react';
import { Cookie, SlidersHorizontal, X } from 'lucide-react';
import type { CookieConsentState } from '../utils/analytics';

interface CookieConsentBannerProps {
  consent: CookieConsentState | null;
  forceOpen: boolean;
  onSave: (analyticsEnabled: boolean) => void;
  onCloseForceOpen: () => void;
  onNavigate: (path: string) => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({
  consent,
  forceOpen,
  onSave,
  onCloseForceOpen,
  onNavigate,
}) => {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState<boolean>(consent?.analytics ?? false);

  const visible = forceOpen || consent === null;
  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Cookie consent"
      data-testid="cookie-consent-banner"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-40 sm:max-w-[440px] border border-[#141414]/30 bg-[#efece6] text-[#141414] shadow-lg p-3.5 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <Cookie className="w-4 h-4 shrink-0 mt-0.5 text-[#141414]" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-mono-label text-[10.5px] font-semibold text-[#141414]">
              Cookie Preferences
            </h2>
            <p className="text-[12px] leading-[1.45] text-[#141414]/75">
              We use one essential session cookie for secure sign-in and optional privacy-first
              analytics. Read our{' '}
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/privacy');
                }}
                className="underline underline-offset-2 text-[#141414] hover:text-[#ff5a5f]"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        {forceOpen && (
          <button
            type="button"
            aria-label="Close cookie preferences"
            onClick={onCloseForceOpen}
            className="p-1 text-[#141414]/60 hover:text-[#141414] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {customizeOpen && (
        <div className="mt-3 pt-3 border-t border-[#141414]/15 space-y-2.5 text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-[#141414]">Essential Session Cookie</div>
              <div className="text-[11px] text-[#141414]/60">
                Required for HttpOnly authentication security.
              </div>
            </div>
            <span className="font-mono-label text-[9.5px] text-[#141414]/60">Always On</span>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <div className="font-medium text-[#141414]">Privacy-First Analytics</div>
              <div className="text-[11px] text-[#141414]/60">
                Aggregate page views &amp; feature usage (no PII).
              </div>
            </div>
            <input
              type="checkbox"
              checked={analyticsDraft}
              onChange={(e) => setAnalyticsDraft(e.target.checked)}
              className="w-4 h-4 accent-[#141414] cursor-pointer"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setAnalyticsDraft(consent?.analytics ?? false);
            setCustomizeOpen((v) => !v);
          }}
          className="h-8 px-2.5 border border-[#141414]/20 bg-[#f6f4ef] hover:border-[#141414] font-mono-label text-[9.5px] inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{customizeOpen ? 'Hide Options' : 'Customize'}</span>
        </button>

        {customizeOpen ? (
          <button
            type="button"
            onClick={() => {
              onSave(analyticsDraft);
              setCustomizeOpen(false);
              onCloseForceOpen();
            }}
            className="h-8 px-3 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
          >
            Save Choices
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onSave(false);
                onCloseForceOpen();
              }}
              className="h-8 px-3 border border-[#141414]/25 bg-[#f6f4ef] hover:border-[#141414] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
            >
              Essential Only
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(true);
                onCloseForceOpen();
              }}
              className="h-8 px-3 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
            >
              Accept All
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
