import type { ERDiagramData, SqlDialect } from '../types/nova';

export type StudioExportFormat = 'sql' | 'svg' | 'png' | 'jpeg' | 'mmd' | 'dbml' | 'json' | 'md';

export interface StandaloneSvgResult {
  markup: string;
  width: number;
  height: number;
}

/**
 * Turns any freeform title into a safe lowercase filename with extension.
 */
export function sanitizeFilename(base: string, ext: string): string {
  const cleanExt = ext.replace(/^\.+/, '').toLowerCase() || 'txt';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'nova-export'}.${cleanExt}`;
}

/**
 * Wraps SQL / DDL in a clean downloadable .sql script with dialect metadata header.
 */
export function buildSqlScriptExport(
  sql: string,
  meta: { title?: string; dialect: SqlDialect; generatedAt?: string }
): string {
  const trimmed = sql.trim();
  const timestamp = meta.generatedAt ?? new Date().toISOString();
  const titleLine = meta.title ? `-- Schema: ${meta.title}` : '-- Exported from NOVA Studio';
  const header = [
    titleLine,
    `-- Dialect: ${meta.dialect.toUpperCase()}`,
    `-- Generated: ${timestamp}`,
    '',
  ].join('\n');

  if (!trimmed) return header;
  return `${header}${trimmed}\n`;
}

/**
 * Converts an ERDiagramData structure to DBML (Database Markup Language) format.
 */
export function buildDbmlExport(diagram: ERDiagramData): string {
  const lines: string[] = [
    `// ${diagram.title || 'NOVA Studio ER Schema'}`,
    '// Exported from NOVA AGENT Studio (DBML)',
    '',
  ];

  for (const entity of diagram.entities) {
    lines.push(`Table ${entity.name} {`);
    for (const col of entity.columns) {
      const attrs: string[] = [];
      if (col.isPrimaryKey) attrs.push('pk');
      if (col.isUnique && !col.isPrimaryKey) attrs.push('unique');
      if (col.isNullable === false && !col.isPrimaryKey) attrs.push('not null');
      const suffix = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
      const cleanType = col.type.trim().replace(/\s+/g, '_') || 'varchar';
      lines.push(`  ${col.name} ${cleanType}${suffix}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const rel of diagram.relationships) {
    const op =
      rel.cardinality === '1:1'
        ? '-'
        : rel.cardinality === 'N:1'
          ? '>'
          : rel.cardinality === 'N:M'
            ? '<>'
            : '<';
    const fromCol = rel.fromColumn || 'id';
    const toCol = rel.toColumn || 'id';
    lines.push(`Ref: ${rel.fromEntity}.${fromCol} ${op} ${rel.toEntity}.${toCol}`);
  }

  return `${lines.join('\n').trim()}\n`;
}

/**
 * Exports structured JSON metadata for schema pipelines and tooling.
 */
export function buildJsonSchemaExport(diagram: ERDiagramData, dialect: SqlDialect): string {
  return `${JSON.stringify(
    {
      generator: 'NOVA AGENT Studio',
      dialect,
      title: diagram.title,
      entities: diagram.entities,
      relationships: diagram.relationships,
    },
    null,
    2
  )}\n`;
}

/**
 * Exports a comprehensive Markdown spec combining Mermaid ER, entity tables, and SQL DDL.
 */
export function buildMarkdownSpecExport(
  diagram: ERDiagramData,
  dialect: SqlDialect,
  sqlDdl: string,
  mermaidCode: string
): string {
  const sections: string[] = [
    `# ${diagram.title || 'Database Schema Specification'}`,
    '',
    `- **Dialect:** ${dialect.toUpperCase()}`,
    `- **Entities:** ${diagram.entities.length}`,
    `- **Relationships:** ${diagram.relationships.length}`,
    '',
  ];

  if (mermaidCode.trim()) {
    sections.push('## Entity-Relationship Diagram', '', '```mermaid', mermaidCode.trim(), '```', '');
  }

  if (diagram.entities.length > 0) {
    sections.push('## Tables', '');
    for (const entity of diagram.entities) {
      sections.push(`### \`${entity.name}\``, '');
      sections.push('| Column | Type | Key | Nullable |');
      sections.push('| --- | --- | --- | --- |');
      for (const col of entity.columns) {
        const key = col.isPrimaryKey ? 'PK' : col.isForeignKey ? 'FK' : col.isUnique ? 'UQ' : '';
        const nullable = col.isNullable === false || col.isPrimaryKey ? 'NO' : 'YES';
        sections.push(`| \`${col.name}\` | \`${col.type}\` | ${key} | ${nullable} |`);
      }
      sections.push('');
    }
  }

  if (sqlDdl.trim()) {
    sections.push(`## SQL DDL (${dialect.toUpperCase()})`, '', '```sql', sqlDdl.trim(), '```', '');
  }

  return sections.join('\n');
}

/**
 * Normalizes SVG markup so it is self-contained (xmlns, explicit width/height, warm paper background)
 * for both direct .svg download and crisp Canvas PNG/JPEG rasterization.
 */
export function prepareStandaloneSvg(
  svgMarkup: string,
  options?: { background?: string; padding?: number }
): StandaloneSvgResult {
  const bg = options?.background ?? '#f6f4ef';
  let markup = svgMarkup.trim();

  // Extract viewBox dimensions first, falling back to width/height attributes
  let width = 960;
  let height = 640;

  const vbMatch = markup.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((n) => Number.parseFloat(n));
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      width = Math.max(120, Math.ceil(parts[2]));
      height = Math.max(120, Math.ceil(parts[3]));
    }
  } else {
    const wMatch = markup.match(/\bwidth=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
    const hMatch = markup.match(/\bheight=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
    if (wMatch) width = Math.max(120, Math.ceil(Number.parseFloat(wMatch[1])));
    if (hMatch) height = Math.max(120, Math.ceil(Number.parseFloat(hMatch[1])));
  }

  // Ensure xmlns attributes on opening <svg>
  markup = markup.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let nextAttrs = attrs;
    if (!/\bxmlns=/.test(nextAttrs)) {
      nextAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    }
    if (!/\bxmlns:xlink=/.test(nextAttrs)) {
      nextAttrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    }
    // Replace percentage/max-width style with explicit numeric width & height for crisp export
    nextAttrs = nextAttrs
      .replace(/\bwidth=["'][^"']*["']/gi, '')
      .replace(/\bheight=["'][^"']*["']/gi, '');
    nextAttrs += ` width="${width}" height="${height}"`;
    return `<svg${nextAttrs}>`;
  });

  // Inject solid warm-paper background rect right after opening <svg ...> if not already added
  if (bg && !markup.includes('data-nova-export-bg="1"')) {
    let bgRect = `<rect data-nova-export-bg="1" width="100%" height="100%" fill="${bg}" />`;
    if (vbMatch) {
      const parts = vbMatch[1]
        .trim()
        .split(/[\s,]+/)
        .map((n) => Number.parseFloat(n));
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        bgRect = `<rect data-nova-export-bg="1" x="${parts[0]}" y="${parts[1]}" width="${parts[2]}" height="${parts[3]}" fill="${bg}" />`;
      }
    }
    markup = markup.replace(/(<svg\b[^>]*>)/i, `$1${bgRect}`);
  }

  return { markup, width, height };
}

/**
 * Triggers a browser file download for text-based formats (.sql, .svg, .mmd, .dbml, .json, .md).
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rasterizes standalone SVG markup to a high-DPI PNG or JPEG image file and downloads it.
 */
export async function downloadSvgAsRasterImage(
  svgMarkup: string,
  filename: string,
  format: 'png' | 'jpeg',
  scale = 2
): Promise<void> {
  const { markup, width, height } = prepareStandaloneSvg(svgMarkup, { background: '#f6f4ef' });

  // Clamp canvas dimensions to safe browser limits while keeping Retina sharpness
  const maxDim = 4096;
  const effectiveScale = Math.min(scale, maxDim / Math.max(width, 1), maxDim / Math.max(height, 1));
  const canvasWidth = Math.max(1, Math.round(width * effectiveScale));
  const canvasHeight = Math.max(1, Math.round(height * effectiveScale));

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode SVG diagram for image export.'));
    image.src = encoded;
  });

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context is unavailable in this browser.');
  }

  ctx.fillStyle = '#f6f4ef';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.95 : undefined;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to encode ${format.toUpperCase()} image.`));
      },
      mime,
      quality
    );
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
