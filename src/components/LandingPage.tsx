import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Menu,
  Send,
  Share2,
  X,
} from 'lucide-react';
import type { AuthUser, NovaMode } from '../types/nova';
import { trackAnalyticsEvent } from '../utils/analytics';
import { FAQ_ITEMS } from '../utils/seo';
import { NovaLogo } from './NovaLogo';
import { RobotCanvas } from './RobotCanvas';

interface LandingPageProps {
  user: AuthUser | null;
  onOpenStudio: (opts?: { mode?: NovaMode; prompt?: string }) => void;
  onOpenAuth: (mode?: 'login' | 'register', pendingPrompt?: string) => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  onOpenCookieSettings: () => void;
}

interface TypingPromptItem {
  text: string;
  mode: NovaMode;
}

const TYPING_PROMPTS: TypingPromptItem[] = [
  {
    text: 'Write a PostgreSQL query for monthly MRR cohort retention across active accounts.',
    mode: 'text-to-query',
  },
  {
    text: 'Generate an ER diagram for a multi-vendor marketplace with orders and shipments.',
    mode: 'er-diagram',
  },
  {
    text: 'Optimize this slow multi-join query and recommend composite B-Tree indexes.',
    mode: 'optimize',
  },
  {
    text: 'Debug why my LEFT JOIN with WHERE status != cancelled drops zero-order users.',
    mode: 'debug',
  },
];

const PRODUCT_TABS: { num: string; label: string; mode: NovaMode }[] = [
  { num: '01', label: 'AI Query Chatbot', mode: 'text-to-query' },
  { num: '02', label: 'Text to ER Diagram', mode: 'er-diagram' },
  { num: '03', label: 'Query Optimizer', mode: 'optimize' },
  { num: '04', label: 'SQL Debugger', mode: 'debug' },
  { num: '05', label: 'Schema DDL Builder', mode: 'schema-builder' },
  { num: '06', label: 'Execution Explainer', mode: 'explain' },
  { num: '07', label: 'Dialect Converter', mode: 'convert' },
  { num: '08', label: 'Index Advisor', mode: 'optimize' },
  { num: '09', label: 'NoSQL Pipelines', mode: 'text-to-query' },
  { num: '10', label: 'AI Query Chatbot', mode: 'text-to-query' },
];

const REVIEWS = [
  {
    index: '01',
    quote:
      '“Slow SQL tuning and schema reviews used to stall every release sprint. Nova Agent optimizes queries and maps ER diagrams in seconds.”',
    name: 'Ilan Brooks',
    role: 'Founder of Halden Capital',
    shirtColor: '#252629',
  },
  {
    index: '02',
    quote:
      '“Nova Agent is a vital asset for our analytics engineers, turning plain business questions into audited Postgres queries effortlessly.”',
    name: 'Rhea Okafor',
    role: 'Co-founder of Tessel Network',
    shirtColor: '#3a2d2b',
  },
  {
    index: '03',
    quote:
      '“The fastest way our team has found to go from a product brief to a normalized 3NF ER diagram and production migration DDL.”',
    name: 'Mara Elling',
    role: 'CTO at Northline Labs',
    shirtColor: '#223034',
  },
];

const BrickWallAvatar: React.FC<{ shirtColor: string; name: string }> = ({
  shirtColor,
  name,
}) => (
  <svg
    width="56"
    height="56"
    viewBox="0 0 56 56"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={`Portrait illustration of ${name}`}
    className="shrink-0 border border-[#141414]/15"
  >
    <title>{`Portrait illustration of ${name}`}</title>
    {/* Warm minimalist brick wall */}
    <rect width="56" height="56" fill="#d9d1c7" />
    <path
      d="M0 10H56M0 20H56M0 30H56M0 40H56M0 50H56M14 0V10M42 0V10M28 10V20M10 20V30M38 20V30M24 30V40M48 30V40M14 40V50M40 40V50"
      stroke="#b7ada1"
      strokeWidth="1"
    />
    {/* Stylized silhouette figure */}
    <circle cx="28" cy="23" r="8.5" fill="#e6cab2" stroke="#141414" strokeWidth="1.2" />
    <path
      d="M20 21C20.5 15.8 24 13.5 28.5 13.5C33.2 13.5 36.2 16.5 36.4 21.5C34 19.5 31.4 18.6 28 18.6C24.8 18.6 22 19.5 20 21Z"
      fill="#1b1b1f"
    />
    <path
      d="M12 56C13 44.5 19.2 38 28 38C36.8 38 43 44.5 44 56H12Z"
      fill={shirtColor}
    />
    <rect x="24.5" y="31.5" width="7" height="7" rx="3" fill="#e6cab2" />
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  user,
  onOpenStudio,
  onOpenAuth,
  onLogout,
  onNavigate,
  onOpenCookieSettings,
}) => {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [scrolledPast40, setScrolledPast40] = useState(false);
  const [activeSection, setActiveSection] = useState<'INTRO' | 'PRODUCT' | 'REVIEWS'>('INTRO');

  // Auto-typing prompt state
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [typingPhase, setTypingPhase] = useState<'typing' | 'hold' | 'deleting' | 'wait'>('typing');

  // Product carousel state (tabs with horizontal rotation)
  const [activeTab, setActiveTab] = useState(0);
  const [tabCarouselPaused, setTabCarouselPaused] = useState(false);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const tabTrackRef = useRef<HTMLDivElement | null>(null);
  const [tabTranslatePx, setTabTranslatePx] = useState(0);

  // Mobile/Tablet navigation drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Reviews carousel state
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewFading, setReviewFading] = useState(false);

  // FAQ accordion state
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  // Social share state
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);

  // Reveal observer state
  const [revealed, setRevealed] = useState<Record<string, boolean>>({
    intro: true,
    product: false,
    reviews: false,
  });

  const introRef = useRef<HTMLElement | null>(null);
  const productRef = useRef<HTMLElement | null>(null);
  const reviewsRef = useRef<HTMLElement | null>(null);
  const faqRef = useRef<HTMLElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);

  // Scroll watcher for top bar + active section
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolledPast40(y > 40);
      const vh = Math.max(window.innerHeight, 1);
      if (y < vh * 0.52) {
        setActiveSection('INTRO');
      } else if (y < vh * 1.52) {
        setActiveSection('PRODUCT');
      } else {
        setActiveSection('REVIEWS');
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Section reveal observer
  useEffect(() => {
    const entriesMap: [string, HTMLElement | null][] = [
      ['intro', introRef.current],
      ['product', productRef.current],
      ['reviews', reviewsRef.current],
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute('data-reveal-key');
            if (key) {
              setRevealed((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
            }
          }
        }
      },
      { threshold: 0.15 }
    );

    entriesMap.forEach(([, el]) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Auto-typing prompt loop (38ms/char, 2.6s hold, delete 2 chars/14ms, 250ms wait)
  useEffect(() => {
    const full = TYPING_PROMPTS[promptIndex].text;
    let timer: number;

    if (typingPhase === 'typing') {
      if (typedText.length < full.length) {
        timer = window.setTimeout(() => {
          setTypedText(full.slice(0, typedText.length + 1));
        }, 38);
      } else {
        timer = window.setTimeout(() => setTypingPhase('hold'), 2600);
      }
    } else if (typingPhase === 'hold') {
      setTypingPhase('deleting');
      return;
    } else if (typingPhase === 'deleting') {
      if (typedText.length > 0) {
        timer = window.setTimeout(() => {
          setTypedText(typedText.slice(0, Math.max(0, typedText.length - 2)));
        }, 14);
      } else {
        timer = window.setTimeout(() => setTypingPhase('wait'), 250);
      }
    } else {
      setPromptIndex((prev) => (prev + 1) % TYPING_PROMPTS.length);
      setTypingPhase('typing');
      return;
    }

    return () => clearTimeout(timer);
  }, [typedText, typingPhase, promptIndex]);

  // Product tab carousel timer (every 2.6s when not hovered/paused)
  useEffect(() => {
    if (tabCarouselPaused) return;
    const id = window.setInterval(() => {
      setActiveTab((prev) => (prev + 1) % (PRODUCT_TABS.length - 1));
    }, 2600);
    return () => clearInterval(id);
  }, [tabCarouselPaused]);

  // Recalculate exact horizontal translation so 76vw (phone), 48vw (tablet), and 33vw (desktop) tabs align after rotation/resize
  useEffect(() => {
    const syncTabOffset = () => {
      const track = tabTrackRef.current;
      if (!track) return;
      const target = track.children[activeTab] as HTMLElement | undefined;
      if (target) {
        setTabTranslatePx(target.offsetLeft);
      }
    };
    syncTabOffset();
    window.addEventListener('resize', syncTabOffset);
    window.addEventListener('orientationchange', syncTabOffset);
    return () => {
      window.removeEventListener('resize', syncTabOffset);
      window.removeEventListener('orientationchange', syncTabOffset);
    };
  }, [activeTab]);

  const rotateProductTab = (delta: number) => {
    const maxIdx = PRODUCT_TABS.length - 1;
    setActiveTab((prev) => (prev + delta + maxIdx) % maxIdx);
  };

  const cycleReview = (delta: number) => {
    if (reviewFading) return;
    setReviewFading(true);
    window.setTimeout(() => {
      setReviewIdx((prev) => (prev + delta + REVIEWS.length) % REVIEWS.length);
      setReviewFading(false);
    }, 320);
  };

  const showTopBar = !bannerDismissed && !scrolledPast40;
  const railPercent = activeSection === 'INTRO' ? 0 : activeSection === 'PRODUCT' ? 31 : 62;
  const currentPrompt = TYPING_PROMPTS[promptIndex];
  const nextPrompt = TYPING_PROMPTS[(promptIndex + 1) % TYPING_PROMPTS.length];
  const activeReview = REVIEWS[reviewIdx];
  const ghostReview = REVIEWS[(reviewIdx + 1) % REVIEWS.length];

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleRouteLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  const handleRunPromptCard = () => {
    trackAnalyticsEvent('hero_prompt_click', { mode: currentPrompt.mode });
    if (!user) {
      onOpenAuth('login', currentPrompt.text);
      return;
    }
    onOpenStudio({
      mode: currentPrompt.mode,
      prompt: currentPrompt.text,
    });
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);

    const name = contactName.trim();
    const email = contactEmail.trim();
    const message = contactMessage.trim();

    if (name.length < 2) {
      setContactError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError('Please enter a valid email address.');
      return;
    }
    if (message.length < 10) {
      setContactError('Please write a message of at least 10 characters.');
      return;
    }

    setContactSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactError(data.error || 'Could not submit your message. Please try again.');
        return;
      }
      setContactSuccess(
        data.message || 'Thank you — your message was received and logged by the NOVA team.'
      );
      setContactName('');
      setContactEmail('');
      setContactMessage('');
      trackAnalyticsEvent('contact_form_submit');
    } catch {
      setContactError('Network error while sending message. Please try again.');
    } finally {
      setContactSubmitting(false);
    }
  };

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://nova-agent-sql-ai.vercel.app/';
  const shareText =
    'NOVA AGENT — Turn plain English into audited SQL queries, Mermaid.js ER diagrams, and schema debug insights.';

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      trackAnalyticsEvent('social_share', { channel: 'copy' });
      window.setTimeout(() => setCopiedShareUrl(false), 1800);
    } catch {
      // Clipboard denied
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'NOVA AGENT — AI SQL & ER Diagram Studio',
          text: shareText,
          url: shareUrl,
        });
        trackAnalyticsEvent('social_share', { channel: 'native' });
      } catch {
        // User canceled share sheet
      }
    }
  };

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="relative min-h-screen bg-[#efece6] text-[#141414] overflow-x-clip">
      {/* Fixed 3D Ceramic Robot Canvas */}
      <RobotCanvas activeSection={activeSection} />

      {/* Fixed vertical editorial grid guides (17%, 50%, 83%) */}
      <div aria-hidden="true" className="fixed inset-0 z-[2] pointer-events-none">
        <div className="hidden lg:block absolute top-0 bottom-0 left-[17%] w-px bg-[#141414]/[0.09]" />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#141414]/[0.09]" />
        <div className="hidden lg:block absolute top-0 bottom-0 left-[83%] w-px bg-[#141414]/[0.09]" />
      </div>

      {/* Top Announcement Bar (30px tall, slides up out of view) */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 h-[30px] bg-[#141414] text-[#efece6] flex items-center justify-center pl-4 pr-10 transition-transform duration-500 ${
          showTopBar ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.6, 0, 0.2, 1)' }}
      >
        <a
          href="/studio"
          onClick={(e) => {
            e.preventDefault();
            trackAnalyticsEvent('cta_click', { location: 'announcement_bar' });
            onOpenStudio();
          }}
          className="font-mono-label text-[10.5px] sm:text-[11px] max-w-full truncate hover:opacity-85 transition-opacity inline-flex items-center gap-1.5"
        >
          <span className="font-semibold text-[#ffb347] shrink-0">New:</span>
          <span className="truncate">
            Nova Agent V1 Is Here — AI Text-to-SQL, ER Diagrams &amp; Optimizer
          </span>
          <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
        </a>
        <button
          type="button"
          aria-label="Dismiss announcement bar"
          onClick={() => setBannerDismissed(true)}
          className="absolute right-3 p-1 text-[#efece6]/70 hover:text-[#efece6] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Fixed Primary Navigation Bar (52px tall, moves to top 0 when scrolled) */}
      <header
        className={`fixed left-0 right-0 z-30 h-[52px] bg-[#efece6]/[0.94] border-b border-[#141414]/15 transition-transform duration-500 ${
          showTopBar ? 'translate-y-[30px]' : 'translate-y-0'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.6, 0, 0.2, 1)' }}
      >
        <div className="h-full w-full flex lg:grid lg:grid-cols-[17%_1fr_12%_17%] items-center justify-between px-3 sm:px-4 lg:px-0">
          {/* Col 1: Brand Wordmark + Mobile Menu Trigger */}
          <div className="lg:px-5 flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414]/5 text-[#141414] cursor-pointer shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <a
              href="#intro"
              onClick={(e) => {
                e.preventDefault();
                setMobileMenuOpen(false);
                scrollToSection(introRef);
              }}
              aria-label="NOVA AGENT home"
              className="shrink-0"
            >
              <NovaLogo />
            </a>
          </div>

          {/* Col 2: Single-line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-6 px-7 font-mono-label text-[11px] text-[#141414]/80"
          >
            <a
              href="#intro"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(introRef);
              }}
              className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#product"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(productRef);
              }}
              className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#reviews"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(reviewsRef);
              }}
              className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0"
            >
              Reviews
            </a>
            <a
              href="#faq"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(faqRef);
              }}
              className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(contactRef);
              }}
              className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
            {user ? (
              <button
                type="button"
                onClick={onLogout}
                className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0 cursor-pointer text-[#141414]"
              >
                {user.name.split(' ')[0]} · Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="hover:text-[#141414] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Col 3: Nova Pad / Studio cell with hairlines on both sides */}
          <a
            href="/studio"
            onClick={(e) => {
              e.preventDefault();
              trackAnalyticsEvent('cta_click', { location: 'nav_pad' });
              onOpenStudio({ mode: 'text-to-query' });
            }}
            className="hidden lg:flex h-full items-center justify-center gap-1.5 border-x border-[#141414]/15 font-mono-label text-[11px] text-[#141414] hover:bg-[#141414]/[0.04] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Nova Pad</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </a>

          {/* Col 4: Launch Nova Primary CTA */}
          <div className="flex items-center justify-end lg:justify-center gap-1.5 sm:gap-2 lg:px-4 shrink-0">
            {!user && (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="lg:hidden font-mono-label text-[10px] sm:text-[11px] px-1.5 sm:px-2.5 h-[30px] text-[#141414]/80 hover:text-[#141414] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
            <a
              href="/studio"
              onClick={(e) => {
                e.preventDefault();
                trackAnalyticsEvent('cta_click', { location: 'nav_launch' });
                onOpenStudio();
              }}
              className="nova-launch-btn h-[30px] px-2.5 sm:px-3.5 font-mono-label text-[10px] sm:text-[11px] text-[#141414] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="hidden sm:inline tracking-tighter">••</span>
              <span>LAUNCH NOVA</span>
            </a>
          </div>
        </div>

        {/* Mobile & Tablet Navigation Drawer (portrait & horizontal rotation) */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="lg:hidden border-b border-[#141414]/20 bg-[#efece6] px-4 py-3 shadow-xl max-h-[calc(100dvh-85px)] overflow-y-auto nova-scroll"
          >
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Overview', ref: introRef },
                { label: 'Capabilities', ref: productRef },
                { label: 'Reviews', ref: reviewsRef },
                { label: 'FAQ', ref: faqRef },
                { label: 'Contact', ref: contactRef },
              ].map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    scrollToSection(link.ref);
                  }}
                  className="px-3 py-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10.5px] text-[#141414] transition-colors cursor-pointer"
                >
                  {link.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenStudio({ mode: 'text-to-query' });
                }}
                className="px-3 py-1.5 border border-[#141414] bg-[#141414] text-[#efece6] font-mono-label text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Nova Pad</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="px-3 py-1.5 border border-[#141414]/25 bg-[#f6f4ef] font-mono-label text-[10.5px] text-[#141414] cursor-pointer"
                >
                  {user.name.split(' ')[0]} · Sign Out
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* Fixed Right Rail (270px tall, vertically centered, hidden <= 900px) */}
      <aside
        aria-label="Section progress"
        className="hidden lg:flex fixed right-5 top-1/2 -translate-y-1/2 z-20 h-[270px] flex-col items-end justify-between select-none"
      >
        <div className="relative h-[220px] flex items-center">
          {/* Floating sliding section label */}
          <div
            className="absolute right-6 flex items-center gap-2 font-mono-label text-[10px] text-[#141414] bg-[#efece6]/90 px-2 py-1 border border-[#141414]/15 transition-all duration-700"
            style={{ top: `${railPercent}%` }}
          >
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full border border-[#141414] inline-flex items-center justify-center"
            >
              <span className="w-1 h-1 rounded-full bg-[#ff5a5f]" />
            </span>
            <span>{activeSection}</span>
          </div>

          {/* 14 tiny vertical rail dots */}
          <div className="flex flex-col justify-between h-full py-1">
            {Array.from({ length: 14 }).map((_, i) => {
              const isHighlighted =
                (activeSection === 'INTRO' && i < 4) ||
                (activeSection === 'PRODUCT' && i >= 4 && i < 9) ||
                (activeSection === 'REVIEWS' && i >= 9);
              return (
                <span
                  key={i}
                  className={`block w-[3px] h-[3px] rounded-full transition-colors ${
                    isHighlighted ? 'bg-[#141414]' : 'bg-[#141414]/25'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <a
          href="/studio"
          onClick={(e) => {
            e.preventDefault();
            onOpenStudio();
          }}
          className="font-mono-label text-[10px] text-[#141414]/75 hover:text-[#141414] inline-flex items-center gap-1.5"
        >
          <Menu className="w-3 h-3" aria-hidden="true" />
          <span>STUDIO</span>
        </a>
      </aside>

      {/* Main Content Layered Above 3D Canvas */}
      <main id="main-content" className="relative z-10">
        {/* ================= SECTION 1: INTRO (100dvh) ================= */}
        <section
          id="intro"
          ref={introRef}
          data-reveal-key="intro"
          className="relative min-h-[100dvh] lg:[@media(min-height:620px)]:h-[100dvh] w-full overflow-x-clip flex flex-col justify-between gap-6 pt-[96px] pb-6 px-4 sm:px-8 lg:block lg:p-0"
        >
          {/* Horizontal hairline rule from prompt box to right guide */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-[30%] left-[39.5%] right-[17%] h-px bg-[#141414]/15"
          />

          {/* Auto-Typing Prompt Box (flow on mobile/tablet/landscape, 17%/30% on tall desktop) */}
          <div
            className={`rv rv-d1 ${revealed.intro ? 'rv-in' : ''} relative w-full max-w-[480px] lg:[@media(min-height:620px)]:max-w-none lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:top-[30%] lg:[@media(min-height:620px)]:left-[17%] lg:[@media(min-height:620px)]:w-[22.5%]`}
          >
            {/* 42px square serif quote tab */}
            <div
              aria-hidden="true"
              className="w-[34px] h-[34px] lg:w-[42px] lg:h-[42px] border border-b-0 border-[#141414]/25 bg-[#efece6]/[0.94] flex items-center justify-center font-serif text-[26px] lg:text-[32px] leading-none pt-2 lg:pt-3 text-[#141414]"
            >
              “
            </div>

            {/* Outlined interactive prompt box with corner brackets */}
            <button
              type="button"
              onClick={handleRunPromptCard}
              title={
                user
                  ? 'Click to run this prompt in NOVA Studio'
                  : 'Sign in first to run this prompt in NOVA Studio'
              }
              className="corner-brackets w-full text-left border border-[#141414]/30 bg-[#efece6]/[0.94] hover:bg-[#f6f4ef] transition-colors p-3 lg:p-4 cursor-pointer group"
            >
              <span className="cb-tl" />
              <span className="cb-tr" />
              <span className="cb-bl" />
              <span className="cb-br" />

              <div className="min-h-[42px] lg:min-h-[64px] font-mono-label text-[10.5px] lg:text-[11px] leading-[1.45] text-[#141414]">
                <span>{typedText}</span>
                <span
                  aria-hidden="true"
                  className="inline-block w-[6px] h-[11px] bg-[#141414] ml-1 align-middle animate-caret"
                />
              </div>

              <div className="mt-2 pt-2 border-t border-[#141414]/10 flex items-center justify-between font-mono-label text-[10px] text-[#141414]/65 group-hover:text-[#141414]">
                <span>{user ? 'RUN IN STUDIO' : 'SIGN IN TO RUN PROMPT'}</span>
                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              </div>
            </button>

            {/* Next prompt preview in faint ink */}
            <p className="hidden lg:block mt-3 px-1 font-mono-label text-[10px] leading-[1.45] text-[#141414]/25 line-clamp-2">
              {nextPrompt.text}
            </p>
          </div>

          {/* Right Feature List (under top rule, right-aligned to 83% guide, 23% wide) */}
          <div
            className={`rv rv-d2 ${revealed.intro ? 'rv-in' : ''} hidden lg:block absolute top-[30%] right-[17%] w-[23%]`}
          >
            {[
              { label: 'TEXT TO SQL', mode: 'text-to-query' as NovaMode, dim: false },
              { label: 'TEXT TO ER DIAGRAM', mode: 'er-diagram' as NovaMode, dim: false },
              { label: 'QUERY OPTIMIZER', mode: 'optimize' as NovaMode, dim: false },
              { label: 'DEBUG & MUCH MORE', mode: 'debug' as NovaMode, dim: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onOpenStudio({ mode: item.mode })}
                className={`w-full h-[26px] border-b border-[#141414]/15 flex items-center relative text-left font-mono-label text-[11px] hover:bg-[#141414]/[0.04] transition-colors cursor-pointer ${
                  item.dim ? 'text-[#141414]/45' : 'text-[#141414]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-[18%] w-[4px] h-[4px] rounded-full bg-[#141414]/50"
                />
                <span className="pl-[24%] truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Bottom Rule from 50% to right edge at bottom 14% */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute bottom-[14%] left-1/2 right-0 h-px bg-[#141414]/15"
          />

          {/* Bottom Row Wrapper on Mobile/Tablet/Landscape */}
          <div className="flex flex-wrap items-end justify-between gap-4 lg:contents">
            {/* Bottom Left Hero Headline */}
            <div
              className={`rv rv-d3 ${revealed.intro ? 'rv-in' : ''} relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:bottom-[4.5%] lg:[@media(min-height:620px)]:left-[4%] max-w-[92vw]`}
            >
              <p className="font-mono-label text-[10.5px] sm:text-[11px] lg:text-[12px] text-[#141414]/75 mb-2 inline-block bg-[#efece6]/90 lg:bg-transparent px-1.5 lg:px-0 py-0.5">
                UNLEASH THE POWER OF
              </p>
              <h1 className="flex flex-col items-start gap-1.5 sm:gap-2 font-normal tracking-[-0.03em] leading-[0.98] text-[clamp(34px,5.25vw,92px)]">
                <span className="headline-box-thinking">Thinking</span>
                <span className="headline-box-machines">Machines</span>
              </h1>
            </div>

            {/* Sub line at bottom 3.6%, left 62% + 18px */}
            <p
              className={`rv rv-d4 ${revealed.intro ? 'rv-in' : ''} hidden md:block lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:bottom-[3.6%] lg:[@media(min-height:620px)]:left-[calc(62%+18px)] max-w-[260px] text-[13.5px] lg:text-[14.5px] leading-[1.45] text-[#141414]/80 bg-[#efece6]/90 lg:bg-transparent px-2 lg:px-0 py-1`}
            >
              Your personal AI architect for SQL queries, ER diagrams, query optimization &amp;
              debugging.
            </p>

            {/* Bottom Right Scroll Link */}
            <button
              type="button"
              onClick={() => scrollToSection(productRef)}
              aria-label="Scroll to product capabilities"
              className="relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:bottom-[3.8%] lg:[@media(min-height:620px)]:right-[3.5%] inline-flex items-center gap-2 sm:gap-3 font-mono-label text-[11px] text-[#141414] bg-[#efece6]/90 lg:bg-transparent px-2 py-1 cursor-pointer hover:opacity-75 transition-opacity shrink-0"
            >
              <span>SCROLL</span>
              <span className="corner-brackets w-7 h-7 border border-[#141414]/25 flex items-center justify-center">
                <span className="cb-tl" />
                <span className="cb-tr" />
                <span className="cb-bl" />
                <span className="cb-br" />
                <ArrowDown className="w-3.5 h-3.5 animate-bob" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        {/* ================= SECTION 2: PRODUCT (100dvh, Tabs with Horizontal Rotation) ================= */}
        <section
          id="product"
          ref={productRef}
          data-reveal-key="product"
          className="relative min-h-[100dvh] lg:[@media(min-height:620px)]:h-[100dvh] w-full overflow-x-clip flex flex-col justify-between gap-6 pt-[96px] pb-8 px-4 sm:px-8 lg:block lg:p-0"
        >
          {/* 74px Tab Carousel Strip with Horizontal Rotation + Controls */}
          <div
            onMouseEnter={() => setTabCarouselPaused(true)}
            onMouseLeave={() => setTabCarouselPaused(false)}
            onTouchStart={() => setTabCarouselPaused(true)}
            className={`rv rv-d1 ${revealed.product ? 'rv-in' : ''} relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:top-[14%] lg:[@media(min-height:620px)]:left-[17%] lg:[@media(min-height:620px)]:right-0 py-2 space-y-2.5`}
          >
            {/* Horizontal Rotation Navigation Header (mobile/tablet/landscape accessible) */}
            <div className="flex items-center justify-between gap-2 pr-0 lg:pr-[17%]">
              <span className="font-mono-label text-[10px] text-[#141414]/60 bg-[#efece6]/90 px-2 py-0.5 border border-[#141414]/15">
                Module {String(activeTab + 1).padStart(2, '0')} / {String(PRODUCT_TABS.length - 1).padStart(2, '0')}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Rotate previous module tab"
                  onClick={() => {
                    setTabCarouselPaused(true);
                    rotateProductTab(-1);
                  }}
                  className="w-8 h-8 border border-[#141414]/25 bg-[#efece6]/95 hover:bg-[#141414] hover:text-[#efece6] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Rotate next module tab"
                  onClick={() => {
                    setTabCarouselPaused(true);
                    rotateProductTab(1);
                  }}
                  className="w-8 h-8 border border-[#141414]/25 bg-[#efece6]/95 hover:bg-[#141414] hover:text-[#efece6] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              ref={tabScrollRef}
              className="overflow-hidden touch-pan-y"
            >
              <div
                ref={tabTrackRef}
                className="flex transition-transform duration-[750ms]"
                style={{
                  transform: `translateX(-${tabTranslatePx}px)`,
                  transitionTimingFunction: 'cubic-bezier(0.65, 0, 0.2, 1)',
                }}
              >
                {PRODUCT_TABS.map((tab, idx) => {
                  const isActive = idx === activeTab;
                  const isPassed = idx < activeTab;
                  return (
                    <button
                      key={`${tab.num}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          onOpenStudio({ mode: tab.mode });
                        } else {
                          setTabCarouselPaused(true);
                          setActiveTab(idx % (PRODUCT_TABS.length - 1));
                        }
                      }}
                      className={`shrink-0 w-[76vw] sm:w-[48vw] lg:w-[33vw] h-[74px] flex items-center text-left transition-opacity duration-500 cursor-pointer ${
                        isPassed
                          ? 'opacity-30 lg:opacity-0 lg:pointer-events-none'
                          : isActive
                          ? 'opacity-100'
                          : 'opacity-40 hover:opacity-75'
                      }`}
                    >
                      <div
                        className={`h-full w-[92%] flex items-center transition-colors ${
                          isActive
                            ? 'corner-brackets border border-[#141414]/35 bg-[#efece6]/[0.94]'
                            : 'border border-[#141414]/20 bg-[#efece6]/65'
                        }`}
                      >
                        {isActive && (
                          <>
                            <span className="cb-tl" />
                            <span className="cb-tr" />
                            <span className="cb-bl" />
                            <span className="cb-br" />
                          </>
                        )}
                        <span className="w-[54px] sm:w-[68px] h-full border-r border-[#141414]/15 flex items-center justify-center font-mono-label text-[12px] tabular-nums shrink-0">
                          {tab.num}
                        </span>
                        <span className="px-3.5 sm:px-5 text-[16px] sm:text-[18px] lg:text-[20px] font-normal tracking-[-0.02em] truncate flex-1">
                          {tab.label}
                        </span>
                        {isActive && (
                          <ArrowUpRight
                            className="w-4 h-4 mr-3.5 sm:mr-4 text-[#141414]/60 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Left Headline */}
          <div
            className={`rv rv-d2 ${revealed.product ? 'rv-in' : ''} relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:bottom-[10%] lg:[@media(min-height:620px)]:left-[4%] max-w-[92vw]`}
          >
            <div aria-hidden="true" className="font-mono-label text-[14px] text-[#141414]/65 mb-2">
              ··
            </div>
            <h2 className="text-[clamp(28px,3.05vw,54px)] font-normal tracking-[-0.025em] leading-[1.12] flex flex-col items-start gap-2">
              <span className="inline-block border border-[#141414]/30 rounded-[8px] px-4 py-1.5 bg-[#efece6]/90 lg:bg-[#efece6]/70">
                Your Gateway
              </span>
              <span className="inline-block px-1 bg-[#efece6]/90 lg:bg-transparent">
                To Database AI
              </span>
            </h2>
            <div className="mt-5">
              <a
                href="/studio"
                onClick={(e) => {
                  e.preventDefault();
                  trackAnalyticsEvent('cta_click', { location: 'product_section' });
                  onOpenStudio({ mode: 'er-diagram' });
                }}
                className="nova-launch-btn h-[36px] px-4 font-mono-label text-[11px] text-[#141414] inline-flex items-center gap-2"
              >
                <span>OPEN QUERY &amp; ER STUDIO</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        {/* ================= SECTION 3: REVIEWS (100dvh) ================= */}
        <section
          id="reviews"
          ref={reviewsRef}
          data-reveal-key="reviews"
          className="relative min-h-[100dvh] lg:[@media(min-height:620px)]:h-[100dvh] w-full overflow-x-clip flex flex-col justify-between gap-6 pt-[96px] pb-8 px-4 sm:px-8 lg:block lg:p-0"
        >
          {/* 60px Header Strip near top with hairline under it */}
          <div
            className={`rv rv-d1 ${revealed.reviews ? 'rv-in' : ''} relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:top-[11%] lg:[@media(min-height:620px)]:left-0 lg:[@media(min-height:620px)]:right-0 min-h-[64px] py-2 border-b border-[#141414]/15 flex items-center bg-[#efece6]/85 lg:bg-transparent px-3 lg:px-0`}
          >
            <div className="w-full lg:pl-[17%] lg:pr-[17%] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="flex items-center gap-2 font-mono-label text-[11px] text-[#141414]/70 shrink-0">
                  <span>TSTMNL</span>
                  <span className="px-1.5 py-0.5 border border-[#141414]/25 tabular-nums text-[#141414]">
                    {activeReview.index}
                  </span>
                </div>

                <BrickWallAvatar
                  shirtColor={activeReview.shirtColor}
                  name={activeReview.name}
                />

                <div
                  className={`flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0 transition-all duration-[420ms] ${
                    reviewFading ? 'opacity-0 translate-y-2.5' : 'opacity-100 translate-y-0'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[14px] sm:text-[15px] font-medium text-[#141414] truncate">
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-[#141414] shrink-0"
                    />
                    <span className="truncate">{activeReview.name}</span>
                  </span>
                  <span className="font-mono-label text-[10px] sm:text-[11px] text-[#141414]/55 truncate">
                    {activeReview.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Left Quote Block */}
          <div
            className={`rv rv-d2 ${revealed.reviews ? 'rv-in' : ''} relative w-full lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:top-[26%] lg:[@media(min-height:620px)]:left-[17%] lg:[@media(min-height:620px)]:w-[21.5vw]`}
          >
            <blockquote
              className={`text-[clamp(18px,1.95vw,32px)] font-normal tracking-[-0.025em] leading-[1.22] text-[#141414] bg-[#efece6]/90 lg:bg-transparent p-3.5 lg:p-0 transition-all duration-[420ms] ${
                reviewFading ? 'opacity-0 translate-y-2.5' : 'opacity-100 translate-y-0'
              }`}
            >
              {activeReview.quote}
            </blockquote>

            <div className="mt-4 sm:mt-6 flex items-center gap-3 bg-[#efece6]/90 lg:bg-transparent px-3 lg:px-0 py-1.5 w-fit">
              <span aria-hidden="true" className="w-8 h-px bg-[#141414]/45" />
              <a
                href="/studio"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenStudio();
                }}
                className="font-mono-label text-[11px] text-[#141414] hover:text-[#ff5a5f] transition-colors"
              >
                Try for yourself (Click Here)
              </a>
            </div>
          </div>

          {/* Ghost Next Review to right of 83% guide (hidden <= 900px) */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-[26%] left-[84.5%] w-[20vw] opacity-10 pointer-events-none select-none"
          >
            <p className="text-[clamp(18px,1.9vw,32px)] leading-[1.2] tracking-[-0.02em]">
              {ghostReview.quote}
            </p>
            <p className="mt-4 font-mono-label text-[11px]">{ghostReview.name}</p>
          </div>

          {/* Bottom Left Prev / Next Arrows */}
          <div className="relative lg:[@media(min-height:620px)]:absolute lg:[@media(min-height:620px)]:bottom-[10%] lg:[@media(min-height:620px)]:left-[17%] flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous review"
              onClick={() => cycleReview(-1)}
              className="w-11 h-11 border border-[#141414]/25 bg-[#efece6]/90 hover:bg-[#141414] hover:text-[#efece6] flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next review"
              onClick={() => cycleReview(1)}
              className="w-11 h-11 border border-[#141414]/25 bg-[#efece6]/90 hover:bg-[#141414] hover:text-[#efece6] flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* ================= SECTION 4: FAQ ACCORDION (SOLID PAPER SURFACE) ================= */}
        <section
          id="faq"
          ref={faqRef}
          aria-labelledby="faq-heading"
          className="relative bg-[#efece6] border-t border-[#141414]/15 py-20 lg:py-24 px-4 sm:px-8 lg:px-[17%]"
        >
          <div className="max-w-[920px]">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 border-b border-[#141414]/15">
              <div>
                <p className="font-mono-label text-[11px] text-[#141414]/60 mb-2">
                  04 · Frequently Asked Questions
                </p>
                <h2
                  id="faq-heading"
                  className="text-[clamp(28px,3.2vw,44px)] font-normal tracking-[-0.025em] leading-[1.08]"
                >
                  SQL, ER Diagrams &amp; Security Explained
                </h2>
              </div>
              <a
                href="/studio"
                onClick={(e) => {
                  e.preventDefault();
                  trackAnalyticsEvent('cta_click', { location: 'faq_header' });
                  onOpenStudio({ mode: 'er-diagram' });
                }}
                className="font-mono-label text-[11px] text-[#141414] hover:text-[#ff5a5f] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Inspect ER Studio</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>

            <div className="divide-y divide-[#141414]/15 border-b border-[#141414]/15">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div key={item.id} className="py-1">
                    <h3>
                      <button
                        type="button"
                        id={`faq-trigger-${item.id}`}
                        aria-expanded={isOpen}
                        aria-controls={`faq-panel-${item.id}`}
                        onClick={() => {
                          const nextOpen = isOpen ? null : item.id;
                          setOpenFaqId(nextOpen);
                          trackAnalyticsEvent('faq_toggle', {
                            id: item.id,
                            open: nextOpen !== null,
                          });
                        }}
                        className="w-full py-5 flex items-center justify-between gap-4 text-left hover:text-[#141414] transition-colors cursor-pointer"
                      >
                        <span className="flex items-baseline gap-4 min-w-0">
                          <span className="font-mono-label text-[10.5px] text-[#141414]/45 tabular-nums shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-[16px] sm:text-[18px] font-medium tracking-[-0.015em] text-[#141414]">
                            {item.question}
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`w-4 h-4 shrink-0 text-[#141414]/65 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </h3>
                    <div
                      id={`faq-panel-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-trigger-${item.id}`}
                      hidden={!isOpen}
                      className="pb-5 pl-8 sm:pl-10 pr-4 text-[14.5px] leading-[1.65] text-[#141414]/75"
                    >
                      {item.answer}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= SECTION 5: CLEAR CTA, SOCIAL SHARE & CONTACT FORM ================= */}
        <section
          id="contact"
          ref={contactRef}
          aria-labelledby="cta-contact-heading"
          className="relative bg-[#f6f4ef] border-t border-[#141414]/15 py-20 lg:py-24 px-4 sm:px-8 lg:px-[17%]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left: Clear Primary CTA + Social Share */}
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="font-mono-label text-[11px] text-[#141414]/60">
                  05 · Ready To Ship Faster Queries
                </p>
                <h2
                  id="cta-contact-heading"
                  className="text-[clamp(30px,3.3vw,48px)] font-normal tracking-[-0.03em] leading-[1.06]"
                >
                  Start Debugging SQL &amp; Schemas Today
                </h2>
                <p className="text-[15.5px] leading-[1.65] text-[#141414]/75 max-w-[460px]">
                  Create a free account to save query threads, queue multi-step prompts, audit slow
                  joins, and inspect interactive Mermaid.js ER diagrams across 6 database dialects.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/studio"
                  onClick={(e) => {
                    e.preventDefault();
                    trackAnalyticsEvent('cta_click', { location: 'bottom_primary' });
                    onOpenStudio();
                  }}
                  className="h-11 px-5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[11px] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <span>Launch NOVA Studio</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </a>

                {!user ? (
                  <button
                    type="button"
                    onClick={() => {
                      trackAnalyticsEvent('cta_click', { location: 'bottom_google_signin' });
                      onOpenAuth('login');
                    }}
                    className="h-11 px-5 border border-[#141414]/30 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[11px] inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>Continue with Google</span>
                  </button>
                ) : (
                  <a
                    href="/studio"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenStudio({ mode: 'er-diagram' });
                    }}
                    className="h-11 px-5 border border-[#141414]/30 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[11px] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <span>Open ER Visualizer</span>
                  </a>
                )}
              </div>

              {/* Social Share Row */}
              <div className="pt-6 border-t border-[#141414]/15 space-y-3">
                <p className="font-mono-label text-[10.5px] text-[#141414]/60">
                  Share NOVA AGENT With Your Engineering Team
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="h-9 px-3 border border-[#141414]/25 bg-[#efece6] hover:border-[#141414] font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedShareUrl ? (
                      <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedShareUrl ? 'Link Copied' : 'Copy Link'}</span>
                  </button>

                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      shareText
                    )}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAnalyticsEvent('social_share', { channel: 'x' })}
                    className="h-9 px-3 border border-[#141414]/25 bg-[#efece6] hover:border-[#141414] font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Share on X</span>
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </a>

                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                      shareUrl
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAnalyticsEvent('social_share', { channel: 'linkedin' })}
                    className="h-9 px-3 border border-[#141414]/25 bg-[#efece6] hover:border-[#141414] font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>LinkedIn</span>
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </a>

                  {canNativeShare && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="h-9 px-3 border border-[#141414]/25 bg-[#efece6] hover:border-[#141414] font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Share</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Validated Contact & Support Form */}
            <form
              id="contact-form"
              onSubmit={handleContactSubmit}
              noValidate
              className="corner-brackets border border-[#141414]/25 bg-[#efece6] p-6 sm:p-8 space-y-4"
            >
              <span className="cb-tl" />
              <span className="cb-tr" />
              <span className="cb-bl" />
              <span className="cb-br" />

              <div>
                <h3 className="font-mono-label text-[11px] font-semibold text-[#141414]">
                  Contact &amp; Engineering Support
                </h3>
                <p className="mt-1 text-[13.5px] text-[#141414]/70">
                  Have a dialect request, schema question, or privacy inquiry? Send us a note.
                </p>
              </div>

              {contactError && (
                <div
                  role="alert"
                  data-testid="contact-error"
                  className="p-3 border border-[#ff5a5f]/50 bg-[#ff5a5f]/10 text-[12.5px] text-[#141414]"
                >
                  {contactError}
                </div>
              )}

              {contactSuccess && (
                <div
                  role="status"
                  data-testid="contact-success"
                  className="p-3 border border-emerald-700/35 bg-emerald-700/10 text-[12.5px] text-[#141414]"
                >
                  {contactSuccess}
                </div>
              )}

              <div>
                <label
                  htmlFor="contact-name"
                  className="block font-mono-label text-[10px] text-[#141414]/70 mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ada Lovelace"
                  required
                  className="w-full h-10 px-3 bg-[#f6f4ef] border border-[#141414]/25 text-[14px] text-[#141414] focus:outline-none focus:border-[#141414]"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="block font-mono-label text-[10px] text-[#141414]/70 mb-1.5"
                >
                  Work Email
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  required
                  className="w-full h-10 px-3 bg-[#f6f4ef] border border-[#141414]/25 text-[14px] text-[#141414] focus:outline-none focus:border-[#141414]"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="block font-mono-label text-[10px] text-[#141414]/70 mb-1.5"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={4}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Tell us about your database stack or feedback..."
                  required
                  className="w-full p-3 bg-[#f6f4ef] border border-[#141414]/25 text-[14px] text-[#141414] focus:outline-none focus:border-[#141414] resize-y"
                />
              </div>

              <button
                type="submit"
                disabled={contactSubmitting}
                className="w-full h-10 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] disabled:opacity-50 font-mono-label text-[11px] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{contactSubmitting ? 'Sending...' : 'Send Message'}</span>
              </button>
            </form>
          </div>
        </section>

        {/* ================= FOOTER ================= */}
        <footer className="relative border-t border-[#141414]/15 bg-[#efece6] py-12 px-4 sm:px-8 lg:px-[17%]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="font-mono-label text-[12px] text-[#141414]">NOVA AGENT · 2026</div>
              <p className="text-[12.5px] text-[#141414]/60">
                AI SQL generation, Mermaid.js ER visualization, and query debugging workspace.
              </p>
            </div>

            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap items-center gap-x-6 gap-y-2.5 font-mono-label text-[10.5px] text-[#141414]/65"
            >
              <a
                href="/studio"
                onClick={(e) => handleRouteLink(e, '/studio')}
                className="hover:text-[#141414] transition-colors"
              >
                NOVA Studio
              </a>
              <a
                href="#faq"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(faqRef);
                }}
                className="hover:text-[#141414] transition-colors"
              >
                FAQ
              </a>
              <a
                href="#contact"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(contactRef);
                }}
                className="hover:text-[#141414] transition-colors"
              >
                Contact
              </a>
              <a
                href="/privacy"
                onClick={(e) => handleRouteLink(e, '/privacy')}
                className="hover:text-[#141414] transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                onClick={(e) => handleRouteLink(e, '/terms')}
                className="hover:text-[#141414] transition-colors"
              >
                Terms of Service
              </a>
              <button
                type="button"
                onClick={onOpenCookieSettings}
                className="hover:text-[#141414] transition-colors cursor-pointer"
              >
                Cookie Preferences
              </button>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
};
