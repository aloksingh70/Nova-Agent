export type AppRoute = 'landing' | 'studio' | 'privacy' | 'terms' | 'not-found';

export interface RouteSeoMeta {
  route: AppRoute;
  path: string;
  title: string;
  description: string;
  robots: string;
}

export const FAQ_ITEMS: { id: string; question: string; answer: string }[] = [
  {
    id: 'dialects',
    question: 'Which SQL and NoSQL database dialects does NOVA AGENT support?',
    answer:
      'NOVA Studio supports PostgreSQL, MySQL 8, SQLite, SQL Server, BigQuery, and MongoDB aggregation pipelines. Switch dialects at any time in the Studio header to adapt syntax, quoting, and index recommendations.',
  },
  {
    id: 'er-visualizer',
    question: 'How does the SQL DDL ER Diagram Visualizer help debug schemas?',
    answer:
      'Paste CREATE TABLE, ALTER TABLE, or CREATE INDEX statements into Schema ER Lab to parse entities and render an interactive Mermaid.js ER diagram. The debugger flags missing primary keys, broken foreign-key targets, FK column type mismatches, duplicate definitions, orphan tables, and unindexed foreign keys in real time.',
  },
  {
    id: 'query-debugger',
    question: 'Can NOVA AGENT explain why a query returns wrong or empty results?',
    answer:
      'Yes. Open Query Debugger Lab and enter your SQL alongside what you expected versus what happened. The analyzer catches = NULL traps, LEFT JOIN predicates placed in WHERE, aggregate filters in WHERE, NOT IN NULL pitfalls, and non-SARGable date/string expressions, offering a line-by-line auto-fix diff.',
  },
  {
    id: 'message-queue',
    question: 'How does the Queued Message System work in Studio mode?',
    answer:
      'You can queue prompts while NOVA AGENT is responding or batch multiple queries in advance. Queued prompts can be reordered, edited inline, paused, resumed, or retried on error, and dispatch sequentially in FIFO order.',
  },
  {
    id: 'security-privacy',
    question: 'How are my account credentials and chat history secured?',
    answer:
      'Passwords are salted with 16-byte random bytes and hashed using scrypt with timing-safe verification on the backend. Sessions use HMAC-SHA256 signed HttpOnly cookies, and analytics tracking remains disabled unless you opt in via Cookie Preferences.',
  },
  {
    id: 'pricing-free',
    question: 'Do I need an account to run AI prompts in NOVA Studio?',
    answer:
      'Yes — whenever you type or submit a prompt to NOVA AGENT, you will be asked to sign in or create a free account first so your query threads, schemas, and history stay securely tied to your workspace. You can still preview the static SQL DDL ER Visualizer right away.',
  },
];

export function resolveRouteFromPath(pathname: string, search = ''): AppRoute {
  const params = new URLSearchParams(search);
  const clean = pathname.replace(/\/+$/, '') || '/';

  if (clean === '/') {
    return params.get('autostart') === '1' ? 'studio' : 'landing';
  }
  if (clean === '/studio') return 'studio';
  if (clean === '/privacy' || clean === '/privacy-policy') return 'privacy';
  if (clean === '/terms' || clean === '/terms-of-service') return 'terms';
  return 'not-found';
}

export function getRouteSeoMeta(route: AppRoute, pathname = '/'): RouteSeoMeta {
  switch (route) {
    case 'studio':
      return {
        route,
        path: '/studio',
        title: 'NOVA Studio — AI SQL, ER Diagram & Schema Debugger',
        description:
          'Generate SQL queries, visualize SQL DDL as interactive Mermaid.js ER diagrams, optimize slow joins, and queue AI prompts in NOVA Studio.',
        robots: 'index, follow',
      };
    case 'privacy':
      return {
        route,
        path: '/privacy',
        title: 'Privacy Policy — NOVA AGENT',
        description:
          'Learn how NOVA AGENT protects your account credentials with scrypt hashing, handles SQL prompts, manages cookies, and honors your data rights.',
        robots: 'index, follow',
      };
    case 'terms':
      return {
        route,
        path: '/terms',
        title: 'Terms of Service — NOVA AGENT',
        description:
          'Review the NOVA AGENT terms of service covering acceptable use, AI-assisted SQL query validation, account responsibilities, and service policies.',
        robots: 'index, follow',
      };
    case 'not-found':
      return {
        route,
        path: pathname || '/404',
        title: '404 Page Not Found — NOVA AGENT',
        description:
          'The requested page could not be found on NOVA AGENT. Return to the home showcase or launch NOVA Studio for AI SQL and ER schema debugging.',
        robots: 'noindex, follow',
      };
    case 'landing':
    default:
      return {
        route: 'landing',
        path: '/',
        title: 'NOVA AGENT — AI SQL, ER Diagrams & Query Debugger',
        description:
          'Turn plain English into audited SQL queries, visualize DDL with Mermaid.js ER diagrams, optimize slow joins, and debug schemas with NOVA AGENT.',
        robots: 'index, follow',
      };
  }
}

export function applyDocumentSeo(route: AppRoute, origin: string, pathname: string): void {
  if (typeof document === 'undefined') return;
  const meta = getRouteSeoMeta(route, pathname);
  const canonicalPath = route === 'not-found' ? pathname : meta.path;
  const canonicalUrl = `${origin.replace(/\/$/, '')}${canonicalPath}`;

  document.title = meta.title;

  const setMeta = (selector: string, attr: 'name' | 'property', key: string, content: string) => {
    let el = document.querySelector<HTMLMetaElement>(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[name="robots"]', 'name', 'robots', meta.robots);
  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  setMeta('meta[property="og:image"]', 'property', 'og:image', `${origin.replace(/\/$/, '')}/og-card.svg`);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', `${origin.replace(/\/$/, '')}/og-card.svg`);

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalUrl);
}
