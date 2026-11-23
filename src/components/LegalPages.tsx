import React from 'react';
import { ArrowLeft, ArrowUpRight, Cookie, ShieldCheck } from 'lucide-react';
import { NovaLogo } from './NovaLogo';

interface LegalPageProps {
  kind: 'privacy' | 'terms';
  onNavigate: (path: string) => void;
  onOpenCookieSettings: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({
  kind,
  onNavigate,
  onOpenCookieSettings,
}) => {
  const isPrivacy = kind === 'privacy';
  const lastUpdated = 'November 22, 2026';

  const handleLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div className="min-h-screen bg-[#efece6] text-[#141414] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 h-[56px] border-b border-[#141414]/15 bg-[#efece6]/95 px-4 sm:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <a
            href="/"
            onClick={(e) => handleLink(e, '/')}
            className="inline-flex items-center hover:opacity-80 transition-opacity shrink-0"
          >
            <NovaLogo />
          </a>
          <a
            href="/"
            onClick={(e) => handleLink(e, '/')}
            className="hidden sm:inline-flex items-center gap-1.5 pl-4 border-l border-[#141414]/15 font-mono-label text-[10.5px] text-[#141414]/70 hover:text-[#141414] whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </a>
        </div>

        <nav aria-label="Legal navigation" className="flex items-center gap-4 sm:gap-6 shrink-0">
          <a
            href="/privacy"
            onClick={(e) => handleLink(e, '/privacy')}
            aria-current={isPrivacy ? 'page' : undefined}
            className={`font-mono-label text-[10.5px] whitespace-nowrap ${
              isPrivacy ? 'text-[#141414] underline underline-offset-4' : 'text-[#141414]/65 hover:text-[#141414]'
            }`}
          >
            Privacy
          </a>
          <a
            href="/terms"
            onClick={(e) => handleLink(e, '/terms')}
            aria-current={!isPrivacy ? 'page' : undefined}
            className={`font-mono-label text-[10.5px] whitespace-nowrap ${
              !isPrivacy ? 'text-[#141414] underline underline-offset-4' : 'text-[#141414]/65 hover:text-[#141414]'
            }`}
          >
            Terms
          </a>
          <a
            href="/studio"
            onClick={(e) => handleLink(e, '/studio')}
            className="nova-launch-btn h-8 px-3 font-mono-label text-[10.5px] text-[#141414] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Open Studio</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 px-4 sm:px-8 py-12 sm:py-16">
        <article className="max-w-[780px] mx-auto space-y-10">
          <header className="space-y-3 pb-8 border-b border-[#141414]/15">
            <div className="font-mono-label text-[10.5px] text-[#141414]/60 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isPrivacy ? 'Legal · Data Protection' : 'Legal · Service Agreement'}</span>
              <span aria-hidden="true">·</span>
              <span>Updated {lastUpdated}</span>
            </div>
            <h1 className="text-[clamp(30px,4vw,46px)] font-normal tracking-[-0.03em] leading-[1.08]">
              {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
            </h1>
            <p className="text-[15.5px] leading-[1.65] text-[#141414]/75">
              {isPrivacy
                ? 'This policy explains what information NOVA AGENT collects, how credentials and database schemas are protected, and the choices you control.'
                : 'These terms govern your access to NOVA AGENT, including NOVA Studio, the SQL DDL ER Visualizer, Query Debugger Lab, and associated APIs.'}
            </p>
          </header>

          {isPrivacy ? (
            <div className="space-y-8 text-[15px] leading-[1.7] text-[#141414]/85">
              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  1. Information We Collect
                </h2>
                <p>
                  When you create an account, we store your display name, email address, and a
                  one-way salted cryptographic password hash generated with Node.js{' '}
                  <code className="font-mono text-[13px] bg-[#f6f4ef] px-1.5 py-0.5 border border-[#141414]/15">
                    scrypt
                  </code>
                  . Plaintext passwords are never written to disk or logged.
                </p>
                <p>
                  When you submit prompts in NOVA Studio, we save your conversation threads and
                  optional schema context so you can search, rename, resume, or delete your history
                  across sessions.
                </p>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  2. How AI Prompts &amp; Schemas Are Processed
                </h2>
                <p>
                  Static SQL linting in Query Debugger Lab and SQL DDL parsing in Schema ER Lab
                  execute locally in your browser without transmitting data. When you submit an AI
                  prompt, your query text and optional DDL context are forwarded server-side to the
                  configured Gemini API model strictly to generate your requested SQL, ER schema, or
                  debugging explanation.
                </p>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  3. Cookies &amp; Consent-Gated Analytics
                </h2>
                <p>
                  NOVA AGENT uses one strictly essential{' '}
                  <code className="font-mono text-[13px] bg-[#f6f4ef] px-1.5 py-0.5 border border-[#141414]/15">
                    HttpOnly
                  </code>{' '}
                  HMAC-signed session cookie to keep you signed in securely. Optional product
                  analytics (aggregate, non-PII page views and feature interactions) remain disabled
                  by default until you explicitly opt in.
                </p>
                <button
                  type="button"
                  onClick={onOpenCookieSettings}
                  className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 border border-[#141414]/30 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10.5px] transition-colors cursor-pointer"
                >
                  <Cookie className="w-3.5 h-3.5" />
                  <span>Manage Cookie Preferences</span>
                </button>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  4. Data Control &amp; Deletion
                </h2>
                <p>
                  You can delete individual chat threads or clear your entire conversation history at
                  any time directly from the NOVA Studio sidebar. You can also rotate your password
                  from the Account Security panel or contact us via the support form on the home page
                  for account removal inquiries.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-8 text-[15px] leading-[1.7] text-[#141414]/85">
              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  1. Acceptance of Terms
                </h2>
                <p>
                  By accessing NOVA AGENT or creating an account, you agree to these Terms of
                  Service and our{' '}
                  <a
                    href="/privacy"
                    onClick={(e) => handleLink(e, '/privacy')}
                    className="underline underline-offset-4 hover:text-[#ff5a5f]"
                  >
                    Privacy Policy
                  </a>
                  . Submitting AI chat prompts requires an authenticated account.
                </p>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  2. Review of AI-Generated SQL &amp; DDL
                </h2>
                <p>
                  NOVA AGENT generates SQL queries, execution explanations, index suggestions, and
                  schema migrations as engineering assistance. You are solely responsible for
                  reviewing, testing in staging, and backing up databases before running any
                  generated SQL or DDL statement in production environments.
                </p>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  3. Acceptable Use &amp; Account Security
                </h2>
                <p>
                  You agree not to upload sensitive regulated credentials, attempt unauthorized
                  access to other accounts, or abuse automated endpoints. Keep your account password
                  confidential and rotate it immediately if you suspect unauthorized activity.
                </p>
              </section>

              <section className="space-y-2.5">
                <h2 className="text-[20px] font-medium text-[#141414] tracking-[-0.015em]">
                  4. Intellectual Property &amp; Service Availability
                </h2>
                <p>
                  You retain full ownership of the schemas, SQL queries, and prompts you author.
                  NOVA AGENT is provided &ldquo;as is&rdquo; without warranty of uninterrupted
                  uptime, and features may evolve as we improve query analysis and visualization
                  capabilities.
                </p>
              </section>
            </div>
          )}
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#141414]/15 bg-[#f6f4ef] px-4 sm:px-8 py-6">
        <div className="max-w-[780px] mx-auto flex flex-wrap items-center justify-between gap-4 font-mono-label text-[10px] text-[#141414]/60">
          <span>NOVA AGENT · 2026</span>
          <div className="flex flex-wrap items-center gap-5">
            <a href="/" onClick={(e) => handleLink(e, '/')} className="hover:text-[#141414]">
              Home
            </a>
            <a href="/studio" onClick={(e) => handleLink(e, '/studio')} className="hover:text-[#141414]">
              Studio
            </a>
            <a href="/privacy" onClick={(e) => handleLink(e, '/privacy')} className="hover:text-[#141414]">
              Privacy Policy
            </a>
            <a href="/terms" onClick={(e) => handleLink(e, '/terms')} className="hover:text-[#141414]">
              Terms
            </a>
            <button
              type="button"
              onClick={onOpenCookieSettings}
              className="hover:text-[#141414] cursor-pointer"
            >
              Cookie Preferences
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
