export type TableAlignment = 'left' | 'center' | 'right';

export interface MarkdownListItem {
  text: string;
  checked?: boolean;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; alignments: TableAlignment[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'link'; label: string; href: string };

/**
 * Validates that a Markdown link URL uses a safe protocol.
 */
export function isSafeMarkdownUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Splits a Markdown table row into trimmed cells, handling optional outer pipes and escaped \|.
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '\\' && stripped[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Checks whether a line is a valid GFM table separator (e.g. | :--- | :---: | ---: |)
 * and extracts column alignments.
 */
export function parseTableSeparator(line: string): TableAlignment[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !/^:?-{3,}:?$/.test(trimmed)) return null;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return null;

  const alignments: TableAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-{2,}:?$/.test(cell)) return null;
    const startsColon = cell.startsWith(':');
    const endsColon = cell.endsWith(':');
    if (startsColon && endsColon) alignments.push('center');
    else if (endsColon) alignments.push('right');
    else alignments.push('left');
  }
  return alignments;
}

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*#*$/;
const FENCE_RE = /^```([a-zA-Z0-9_+-]*)\s*$/;
const HR_RE = /^(?:---+|___+|\*\*\*+)\s*$/;
const UNORDERED_ITEM_RE = /^[-*+]\s+(.*)$/;
const ORDERED_ITEM_RE = /^\d+[.)]\s+(.*)$/;
const TASK_PREFIX_RE = /^\[( |x|X)\]\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

function isBlockStart(lines: string[], idx: number): boolean {
  const line = lines[idx];
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (FENCE_RE.test(trimmed)) return true;
  if (HEADING_RE.test(trimmed)) return true;
  if (HR_RE.test(trimmed)) return true;
  if (BLOCKQUOTE_RE.test(trimmed)) return true;
  if (UNORDERED_ITEM_RE.test(trimmed) || ORDERED_ITEM_RE.test(trimmed)) return true;
  // GFM Table lookahead
  if (
    trimmed.includes('|') &&
    idx + 1 < lines.length &&
    parseTableSeparator(lines[idx + 1]) !== null
  ) {
    return true;
  }
  return false;
}

/**
 * Parses Markdown text into structured blocks (code fences, tables, lists, headings, blockquotes, paragraphs).
 */
export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced code block
    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      const language = (fenceMatch[1] || 'sql').toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && /^```\s*$/.test(lines[i].trim())) {
        i++;
      }
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 2. GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const alignments = parseTableSeparator(lines[i + 1]);
      if (alignments) {
        const headers = splitTableRow(rawLine);
        const colCount = Math.max(headers.length, alignments.length);
        const paddedHeaders = Array.from({ length: colCount }, (_, idx) => headers[idx] ?? '');
        const paddedAlign = Array.from(
          { length: colCount },
          (_, idx) => alignments[idx] ?? 'left'
        );
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length) {
          const rowTrimmed = lines[i].trim();
          if (!rowTrimmed || !rowTrimmed.includes('|')) break;
          if (FENCE_RE.test(rowTrimmed) || HEADING_RE.test(rowTrimmed)) break;
          const cells = splitTableRow(lines[i]);
          rows.push(Array.from({ length: colCount }, (_, idx) => cells[idx] ?? ''));
          i++;
        }
        blocks.push({
          type: 'table',
          headers: paddedHeaders,
          alignments: paddedAlign,
          rows,
        });
        continue;
      }
    }

    // 3. Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // 4. Horizontal rule
    if (HR_RE.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 5. Blockquote
    if (BLOCKQUOTE_RE.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(BLOCKQUOTE_RE);
        if (!m) break;
        quoteLines.push(m[1]);
        i++;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    // 6. Unordered or ordered list
    const unorderedStart = UNORDERED_ITEM_RE.test(trimmed);
    const orderedStart = !unorderedStart && ORDERED_ITEM_RE.test(trimmed);
    if (unorderedStart || orderedStart) {
      const ordered = orderedStart;
      const itemRe = ordered ? ORDERED_ITEM_RE : UNORDERED_ITEM_RE;
      const items: MarkdownListItem[] = [];

      while (i < lines.length) {
        const curTrimmed = lines[i].trim();
        const match = curTrimmed.match(itemRe);
        if (!match) break;

        let itemText = match[1].trim();
        let checked: boolean | undefined;
        if (!ordered) {
          const taskMatch = itemText.match(TASK_PREFIX_RE);
          if (taskMatch) {
            checked = taskMatch[1].toLowerCase() === 'x';
            itemText = taskMatch[2].trim();
          }
        }
        items.push(checked === undefined ? { text: itemText } : { text: itemText, checked });
        i++;
      }

      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // 7. Paragraph (consume consecutive plain lines until next block or blank line)
    const paraLines: string[] = [rawLine.trim()];
    i++;
    while (i < lines.length && !isBlockStart(lines, i)) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({
      type: 'paragraph',
      text: paraLines.join(' '),
    });
  }

  return blocks;
}

const INLINE_TOKEN_RE =
  /`([^`\n]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*/g;

/**
 * Parses inline Markdown spans (inline code, bold, italic, strikethrough, safe links)
 * into plain tokens for XSS-free React rendering.
 */
export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  INLINE_TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ type: 'code', value: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const href = match[3];
      if (isSafeMarkdownUrl(href)) {
        tokens.push({ type: 'link', label, href });
      } else {
        tokens.push({ type: 'text', value: label });
      }
    } else if (match[4] !== undefined || match[5] !== undefined) {
      tokens.push({ type: 'bold', value: match[4] ?? match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: 'strike', value: match[6] });
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'italic', value: match[7] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}
