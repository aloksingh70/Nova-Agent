import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-mongodb';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-cypher';
import 'prismjs/components/prism-mermaid';

export type PrismLanguageKey =
  | 'sql'
  | 'mongodb'
  | 'javascript'
  | 'json'
  | 'graphql'
  | 'cypher'
  | 'mermaid';

export interface PrismHighlightSegment {
  type: string;
  content: string;
}

/**
 * Normalizes SQL, NoSQL, and diagram language aliases to registered Prism grammars.
 */
export function resolvePrismLanguage(rawLang?: string): PrismLanguageKey {
  const clean = (rawLang || 'sql').trim().toLowerCase();
  if (
    clean === 'mongodb' ||
    clean === 'mongo' ||
    clean === 'nosql' ||
    clean === 'mql'
  ) {
    return 'mongodb';
  }
  if (
    clean === 'javascript' ||
    clean === 'js' ||
    clean === 'typescript' ||
    clean === 'ts'
  ) {
    return 'javascript';
  }
  if (clean === 'json' || clean === 'bson' || clean === 'json5') {
    return 'json';
  }
  if (clean === 'graphql' || clean === 'gql') {
    return 'graphql';
  }
  if (clean === 'cypher' || clean === 'neo4j') {
    return 'cypher';
  }
  if (clean === 'mermaid' || clean === 'mmd') {
    return 'mermaid';
  }
  return 'sql';
}

function flattenPrismTokens(
  nodes: Array<string | Prism.Token>,
  inheritedType: string,
  out: PrismHighlightSegment[]
): void {
  for (const node of nodes) {
    if (typeof node === 'string') {
      if (node.length > 0) {
        out.push({ type: inheritedType, content: node });
      }
      continue;
    }

    const tokenType = node.type || inheritedType;
    if (typeof node.content === 'string') {
      out.push({ type: tokenType, content: node.content });
    } else if (Array.isArray(node.content)) {
      flattenPrismTokens(node.content, tokenType, out);
    } else if (node.content && typeof node.content === 'object') {
      flattenPrismTokens([node.content], tokenType, out);
    }
  }
}

/**
 * Tokenizes SQL, MongoDB/NoSQL, JSON, GraphQL, Cypher, and Mermaid code via Prism.js
 * into flat XSS-safe segments for React rendering.
 */
export function highlightCodeWithPrism(
  code: string,
  language?: string
): PrismHighlightSegment[] {
  if (!code) return [];

  const resolved = resolvePrismLanguage(language);
  const grammar =
    Prism.languages[resolved] || Prism.languages.sql || Prism.languages.javascript;

  if (!grammar) {
    return [{ type: 'plain', content: code }];
  }

  const tokenStream = Prism.tokenize(code, grammar);
  const segments: PrismHighlightSegment[] = [];
  flattenPrismTokens(tokenStream, 'plain', segments);
  return segments;
}

/**
 * Maps Prism token types to high-contrast editorial colors on NOVA Studio's #19191c code surface.
 */
export function getPrismTokenClass(type: string): string {
  switch (type) {
    case 'keyword':
    case 'atrule':
    case 'selector':
    case 'important':
      return 'text-[#ff8a3d] font-medium';
    case 'function':
    case 'builtin':
    case 'class-name':
    case 'entity':
      return 'text-[#7dd3fc]';
    case 'property':
    case 'variable':
    case 'attr-name':
    case 'symbol':
      return 'text-[#c4b5fd]';
    case 'string':
    case 'char':
    case 'regex':
    case 'attr-value':
    case 'template-string':
      return 'text-[#ffd27d]';
    case 'number':
    case 'boolean':
    case 'constant':
      return 'text-[#ff6b9d]';
    case 'comment':
    case 'prolog':
    case 'doctype':
      return 'text-[#9ca3af] italic';
    case 'operator':
    case 'arrow':
      return 'text-[#fca5a5]';
    case 'punctuation':
      return 'text-[#f3f0ea]/60';
    default:
      return 'text-[#f3f0ea]';
  }
}
