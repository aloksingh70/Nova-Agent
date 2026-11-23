import React from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { NovaLogo } from './NovaLogo';

interface NotFoundPageProps {
  attemptedPath: string;
  onNavigate: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ attemptedPath, onNavigate }) => {
  const handleLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div
      data-testid="custom-404-page"
      className="min-h-screen bg-[#efece6] text-[#141414] flex flex-col"
    >
      <header className="h-[56px] border-b border-[#141414]/15 px-4 sm:px-8 flex items-center justify-between">
        <a href="/" onClick={(e) => handleLink(e, '/')} className="inline-flex items-center">
          <NovaLogo />
        </a>
        <a
          href="/studio"
          onClick={(e) => handleLink(e, '/studio')}
          className="nova-launch-btn h-8 px-3 font-mono-label text-[10.5px] text-[#141414] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>Launch Studio</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </header>

      <main id="main-content" className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="corner-brackets max-w-[540px] w-full border border-[#141414]/25 bg-[#f6f4ef] p-8 sm:p-10 space-y-6">
          <span className="cb-tl" />
          <span className="cb-tr" />
          <span className="cb-bl" />
          <span className="cb-br" />

          <div className="space-y-2">
            <p className="font-mono-label text-[11px] text-[#ff5a5f]">
              Error 404 · Route Not Found
            </p>
            <h1 className="text-[clamp(36px,5vw,56px)] font-normal tracking-[-0.03em] leading-[1.04]">
              Page Not Found
            </h1>
            <p className="text-[15px] leading-[1.6] text-[#141414]/75">
              We could not locate{' '}
              <code className="font-mono text-[13px] bg-[#efece6] px-1.5 py-0.5 border border-[#141414]/15 break-all">
                {attemptedPath}
              </code>
              . Return to the showcase or launch NOVA Studio to work on SQL queries and ER diagrams.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="/"
              onClick={(e) => handleLink(e, '/')}
              className="h-10 px-4 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10.5px] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return Home</span>
            </a>
            <a
              href="/studio"
              onClick={(e) => handleLink(e, '/studio')}
              className="h-10 px-4 border border-[#141414]/30 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10.5px] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>Open NOVA Studio</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <nav
            aria-label="Helpful links"
            className="pt-4 border-t border-[#141414]/12 flex flex-wrap items-center gap-5 font-mono-label text-[10px] text-[#141414]/60"
          >
            <a href="/privacy" onClick={(e) => handleLink(e, '/privacy')} className="hover:text-[#141414]">
              Privacy Policy
            </a>
            <a href="/terms" onClick={(e) => handleLink(e, '/terms')} className="hover:text-[#141414]">
              Terms of Service
            </a>
          </nav>
        </div>
      </main>
    </div>
  );
};
