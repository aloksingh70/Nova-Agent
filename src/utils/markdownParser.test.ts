import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSafeMarkdownUrl,
  parseInlineMarkdown,
  parseMarkdownBlocks,
  parseTableSeparator,
  splitTableRow,
} from './markdownParser';

test('parseMarkdownBlocks extracts fenced code blocks with language identifiers', () => {
  const md = [
    'Here is the indexed query:',
    '',
    '```sql',
    'SELECT id, email',
    'FROM customers',
    'WHERE active = true;',
    '```',
  ].join('\n');

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { type: 'paragraph', text: 'Here is the indexed query:' });
  assert.deepEqual(blocks[1], {
    type: 'code',
    language: 'sql',
    code: 'SELECT id, email\nFROM customers\nWHERE active = true;',
  });
});

test('parseMarkdownBlocks parses GFM tables with alignments and escaped pipes', () => {
  const md = [
    '| Column | Type | Cardinality |',
    '| :--- | :---: | ---: |',
    '| `user_id` | UUID | 1:N |',
    '| `status` | VARCHAR | a \\| b |',
  ].join('\n');

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  if (blocks[0].type === 'table') {
    assert.deepEqual(blocks[0].headers, ['Column', 'Type', 'Cardinality']);
    assert.deepEqual(blocks[0].alignments, ['left', 'center', 'right']);
    assert.deepEqual(blocks[0].rows, [
      ['`user_id`', 'UUID', '1:N'],
      ['`status`', 'VARCHAR', 'a | b'],
    ]);
  }
  assert.deepEqual(splitTableRow('| a | b |'), ['a', 'b']);
  assert.equal(parseTableSeparator('not a separator'), null);
});

test('parseMarkdownBlocks parses headings, unordered, ordered, task lists, and blockquotes', () => {
  const md = [
    '## Schema Audit Summary',
    '',
    '- Add composite index on `orders(customer_id, created_at)`',
    '- [x] Primary keys verified',
    '- [ ] Partitioning pending',
    '',
    '1. Filter active rows first',
    '2. Aggregate revenue per cohort',
    '',
    '> Avoid wrapping indexed timestamps in `YEAR()`.',
  ].join('\n');

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[0], { type: 'heading', level: 2, text: 'Schema Audit Summary' });
  assert.deepEqual(blocks[1], {
    type: 'list',
    ordered: false,
    items: [
      { text: 'Add composite index on `orders(customer_id, created_at)`' },
      { text: 'Primary keys verified', checked: true },
      { text: 'Partitioning pending', checked: false },
    ],
  });
  assert.deepEqual(blocks[2], {
    type: 'list',
    ordered: true,
    items: [{ text: 'Filter active rows first' }, { text: 'Aggregate revenue per cohort' }],
  });
  assert.deepEqual(blocks[3], {
    type: 'blockquote',
    lines: ['Avoid wrapping indexed timestamps in `YEAR()`.'],
  });
});

test('parseInlineMarkdown formats code, bold, italic, strikethrough and blocks unsafe URLs', () => {
  const tokens = parseInlineMarkdown(
    'Use **`LEFT JOIN`** with *index* ~~`NOT IN`~~ [Docs](https://postgresql.org) and [XSS](javascript:alert(1))'
  );
  assert.ok(tokens.some((t) => t.type === 'bold' && t.value === '`LEFT JOIN`'));
  assert.ok(tokens.some((t) => t.type === 'italic' && t.value === 'index'));
  assert.ok(tokens.some((t) => t.type === 'strike' && t.value === '`NOT IN`'));
  assert.ok(
    tokens.some((t) => t.type === 'link' && t.label === 'Docs' && t.href === 'https://postgresql.org')
  );
  // Unsafe javascript: link is neutralized into plain text
  assert.ok(!tokens.some((t) => t.type === 'link' && t.label === 'XSS'));
  assert.ok(tokens.some((t) => t.type === 'text' && t.value === 'XSS'));

  assert.equal(isSafeMarkdownUrl('https://example.com'), true);
  assert.equal(isSafeMarkdownUrl('javascript:alert(1)'), false);
  assert.equal(isSafeMarkdownUrl('data:text/html,<script>'), false);
});
