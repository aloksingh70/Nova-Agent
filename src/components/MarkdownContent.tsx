import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  type TableAlignment,
} from '../utils/markdownParser';
import { SqlCodeBlock } from './SqlCodeBlock';

interface MarkdownContentProps {
  content: string;
  tone?: 'light' | 'dark';
  inlineOnly?: boolean;
  className?: string;
}

const InlineMarkdown: React.FC<{ text: string; tone: 'light' | 'dark' }> = ({ text, tone }) => {
  const tokens = useMemo(() => parseInlineMarkdown(text), [text]);
  const isDark = tone === 'dark';

  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case 'code':
            return (
              <code
                key={i}
                className={`font-mono text-[0.88em] px-1.5 py-0.5 border ${
                  isDark
                    ? 'bg-white/10 border-white/15 text-[#ffd27d]'
                    : 'bg-[#efece6] border-[#141414]/15 text-[#141414]'
                }`}
              >
                {tok.value}
              </code>
            );
          case 'bold':
            return (
              <strong key={i} className="font-semibold">
                <InlineMarkdown text={tok.value} tone={tone} />
              </strong>
            );
          case 'italic':
            return (
              <em key={i} className="italic">
                {tok.value}
              </em>
            );
          case 'strike':
            return (
              <del key={i} className="line-through opacity-65">
                {tok.value}
              </del>
            );
          case 'link':
            return (
              <a
                key={i}
                href={tok.href}
                target={tok.href.startsWith('http') ? '_blank' : undefined}
                rel={tok.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className={`underline underline-offset-2 transition-colors ${
                  isDark
                    ? 'text-[#ffb347] hover:text-white'
                    : 'text-[#141414] hover:text-[#ff5a5f]'
                }`}
              >
                {tok.label}
              </a>
            );
          default:
            return <React.Fragment key={i}>{tok.value}</React.Fragment>;
        }
      })}
    </>
  );
};

function alignmentClass(align: TableAlignment): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  tone = 'light',
  inlineOnly = false,
  className = '',
}) => {
  const blocks = useMemo(() => (inlineOnly ? [] : parseMarkdownBlocks(content)), [content, inlineOnly]);
  const isDark = tone === 'dark';

  if (inlineOnly) {
    return (
      <span className={className}>
        <InlineMarkdown text={content} tone={tone} />
      </span>
    );
  }

  return (
    <div
      data-testid="markdown-content"
      className={`space-y-3 text-[14.5px] leading-[1.6] ${
        isDark ? 'text-[#efece6]' : 'text-[#141414]'
      } ${className}`}
    >
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const sizeClass =
              block.level === 1
                ? 'text-[19px] font-semibold tracking-[-0.02em]'
                : block.level === 2
                  ? 'text-[17px] font-semibold tracking-[-0.015em]'
                  : block.level === 3
                    ? 'text-[15px] font-semibold'
                    : 'font-mono-label text-[11px] font-semibold opacity-80';
            return (
              <div key={idx} className={`${sizeClass} pt-1`}>
                <InlineMarkdown text={block.text} tone={tone} />
              </div>
            );
          }

          case 'code': {
            const langLabel = block.language
              ? `${block.language.toUpperCase()} Snippet`
              : 'Code Snippet';
            return (
              <SqlCodeBlock
                key={idx}
                code={block.code}
                label={langLabel}
                language={block.language || 'sql'}
                compact
              />
            );
          }

          case 'table':
            return (
              <div
                key={idx}
                className={`nova-scroll overflow-x-auto border ${
                  isDark ? 'border-white/20 bg-white/[0.03]' : 'border-[#141414]/20 bg-[#efece6]/50'
                }`}
              >
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr
                      className={`border-b ${
                        isDark
                          ? 'border-white/20 bg-white/10 text-[#efece6]'
                          : 'border-[#141414]/20 bg-[#efece6] text-[#141414]'
                      }`}
                    >
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          scope="col"
                          className={`px-3 py-2 font-mono-label text-[10px] font-semibold whitespace-nowrap ${alignmentClass(
                            block.alignments[hIdx] ?? 'left'
                          )}`}
                        >
                          <InlineMarkdown text={h} tone={tone} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y ${
                      isDark ? 'divide-white/10' : 'divide-[#141414]/12'
                    }`}
                  >
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          isDark
                            ? 'hover:bg-white/[0.04]'
                            : rIdx % 2 === 1
                              ? 'bg-[#f6f4ef]'
                              : 'bg-[#efece6]/30'
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-3 py-2 align-top tabular-nums ${alignmentClass(
                              block.alignments[cIdx] ?? 'left'
                            )}`}
                          >
                            <InlineMarkdown text={cell} tone={tone} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'list':
            if (block.ordered) {
              return (
                <ol key={idx} className="space-y-1.5 pl-1">
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-2.5">
                      <span
                        className={`font-mono text-[11px] tabular-nums pt-0.5 shrink-0 ${
                          isDark ? 'text-[#efece6]/55' : 'text-[#141414]/50'
                        }`}
                      >
                        {String(itemIdx + 1).padStart(2, '0')}.
                      </span>
                      <span className="min-w-0 break-words">
                        <InlineMarkdown text={item.text} tone={tone} />
                      </span>
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={idx} className="space-y-1.5 pl-1">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2.5">
                    {item.checked !== undefined ? (
                      <span
                        aria-label={item.checked ? 'Completed item' : 'Pending item'}
                        className={`mt-1 w-3.5 h-3.5 border inline-flex items-center justify-center shrink-0 ${
                          item.checked
                            ? isDark
                              ? 'border-[#ffb347] bg-[#ffb347] text-[#141414]'
                              : 'border-[#141414] bg-[#141414] text-[#efece6]'
                            : isDark
                              ? 'border-white/35'
                              : 'border-[#141414]/35'
                        }`}
                      >
                        {item.checked && <Check className="w-2.5 h-2.5" aria-hidden="true" />}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`mt-2 w-1.5 h-1.5 shrink-0 ${
                          isDark ? 'bg-[#ffb347]' : 'bg-[#ff5a5f]'
                        }`}
                      />
                    )}
                    <span className="min-w-0 break-words">
                      <InlineMarkdown text={item.text} tone={tone} />
                    </span>
                  </li>
                ))}
              </ul>
            );

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className={`border-l-2 pl-3.5 py-0.5 space-y-1 text-[13.5px] ${
                  isDark
                    ? 'border-[#ffb347] text-[#efece6]/85'
                    : 'border-[#ff5a5f] text-[#141414]/80 bg-[#efece6]/55 pr-3 py-2'
                }`}
              >
                {block.lines.map((line, lIdx) => (
                  <p key={lIdx}>
                    <InlineMarkdown text={line} tone={tone} />
                  </p>
                ))}
              </blockquote>
            );

          case 'hr':
            return (
              <hr
                key={idx}
                className={isDark ? 'border-white/15' : 'border-[#141414]/15'}
              />
            );

          case 'paragraph':
          default:
            return (
              <p key={idx} className="break-words">
                <InlineMarkdown text={block.text} tone={tone} />
              </p>
            );
        }
      })}
    </div>
  );
};
