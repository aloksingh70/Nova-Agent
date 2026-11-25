import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { ERDiagramData, SqlDialect } from '../types/nova';
import { computeERLayout, erDiagramToMermaid, erDiagramToSQL } from '../utils/erLayout';
import {
  buildDbmlExport,
  buildJsonSchemaExport,
  buildMarkdownSpecExport,
  buildSqlScriptExport,
  downloadSvgAsRasterImage,
  downloadTextFile,
  prepareStandaloneSvg,
  sanitizeFilename,
  type StudioExportFormat,
} from '../utils/exportStudio';
import { ExportMenu, type ExportMenuOption } from './ExportMenu';
import { SqlCodeBlock } from './SqlCodeBlock';

interface ERDiagramCanvasProps {
  diagram: ERDiagramData;
  dialect: SqlDialect;
}

type ViewTab = 'diagram' | 'ddl' | 'mermaid';

export const ERDiagramCanvas: React.FC<ERDiagramCanvasProps> = ({ diagram, dialect }) => {
  const [view, setView] = useState<ViewTab>('diagram');
  const [zoom, setZoom] = useState(1);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(() => computeERLayout(diagram), [diagram]);
  const sqlDdl = useMemo(() => erDiagramToSQL(diagram, dialect), [diagram, dialect]);
  const mermaidCode = useMemo(() => erDiagramToMermaid(diagram), [diagram]);

  const exportBaseName = `${diagram.title || 'er-diagram'}-${dialect}`;

  const exportOptions: ExportMenuOption[] = useMemo(
    () => [
      { format: 'png', label: 'PNG Image (2x Hi-Res)', extension: 'png', group: 'image' },
      { format: 'jpeg', label: 'JPEG Image', extension: 'jpg', group: 'image' },
      { format: 'svg', label: 'SVG Vector Diagram', extension: 'svg', group: 'image' },
      {
        format: 'sql',
        label: `SQL DDL Script (${dialect.toUpperCase()})`,
        extension: 'sql',
        group: 'schema',
      },
      { format: 'mmd', label: 'Mermaid ER Source', extension: 'mmd', group: 'schema' },
      { format: 'dbml', label: 'DBML Schema', extension: 'dbml', group: 'schema' },
      { format: 'md', label: 'Markdown Spec Bundle', extension: 'md', group: 'schema' },
      { format: 'json', label: 'JSON Schema Metadata', extension: 'json', group: 'schema' },
    ],
    [dialect]
  );

  const getSerializedSvg = (): string | null => {
    if (!svgRef.current) return null;
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgRef.current);
  };

  const handleExportFormat = async (format: StudioExportFormat) => {
    switch (format) {
      case 'png': {
        const raw = getSerializedSvg();
        if (!raw) throw new Error('Visual ER canvas is unavailable.');
        await downloadSvgAsRasterImage(raw, sanitizeFilename(exportBaseName, 'png'), 'png', 2);
        return;
      }
      case 'jpeg': {
        const raw = getSerializedSvg();
        if (!raw) throw new Error('Visual ER canvas is unavailable.');
        await downloadSvgAsRasterImage(raw, sanitizeFilename(exportBaseName, 'jpg'), 'jpeg', 2);
        return;
      }
      case 'svg': {
        const raw = getSerializedSvg();
        if (!raw) throw new Error('Visual ER canvas is unavailable.');
        const { markup } = prepareStandaloneSvg(raw, { background: '#f6f4ef' });
        downloadTextFile(
          markup,
          sanitizeFilename(exportBaseName, 'svg'),
          'image/svg+xml;charset=utf-8'
        );
        return;
      }
      case 'sql': {
        const script = buildSqlScriptExport(sqlDdl, { title: diagram.title, dialect });
        downloadTextFile(
          script,
          sanitizeFilename(exportBaseName, 'sql'),
          'application/sql;charset=utf-8'
        );
        return;
      }
      case 'mmd': {
        downloadTextFile(
          `${mermaidCode.trim()}\n`,
          sanitizeFilename(exportBaseName, 'mmd'),
          'text/plain;charset=utf-8'
        );
        return;
      }
      case 'dbml': {
        downloadTextFile(
          buildDbmlExport(diagram),
          sanitizeFilename(exportBaseName, 'dbml'),
          'text/plain;charset=utf-8'
        );
        return;
      }
      case 'md': {
        downloadTextFile(
          buildMarkdownSpecExport(diagram, dialect, sqlDdl, mermaidCode),
          sanitizeFilename(exportBaseName, 'md'),
          'text/markdown;charset=utf-8'
        );
        return;
      }
      case 'json': {
        downloadTextFile(
          buildJsonSchemaExport(diagram, dialect),
          sanitizeFilename(exportBaseName, 'json'),
          'application/json;charset=utf-8'
        );
        return;
      }
    }
  };

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopiedSvg(true);
      window.setTimeout(() => setCopiedSvg(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div
      data-testid="er-diagram-viewer"
      className="border border-[#141414]/20 bg-[#f6f4ef]"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[#141414]/15 bg-[#efece6]">
        <div className="min-w-0">
          <h4 className="text-[14px] font-medium text-[#141414] truncate">{diagram.title}</h4>
          <p className="font-mono-label text-[10px] text-[#141414]/55 tabular-nums">
            {diagram.entities.length} entities · {diagram.relationships.length} relationships
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented View Tabs */}
          <div className="inline-flex border border-[#141414]/20 bg-[#f6f4ef]">
            {(
              [
                { id: 'diagram', label: 'Visual ER' },
                { id: 'ddl', label: 'SQL DDL' },
                { id: 'mermaid', label: 'Mermaid' },
              ] as { id: ViewTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`px-2.5 py-1 font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer ${
                  view === tab.id
                    ? 'bg-[#141414] text-[#efece6]'
                    : 'text-[#141414]/70 hover:text-[#141414]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === 'diagram' && (
            <div className="inline-flex items-center border border-[#141414]/20 bg-[#f6f4ef]">
              <button
                type="button"
                aria-label="Zoom out ER diagram"
                onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-[#141414]/10 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[10px] tabular-nums text-[#141414]/80">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in ER diagram"
                onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-[#141414]/10 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Reset ER diagram zoom"
                onClick={() => {
                  setZoom(1);
                  setSelectedEntity(null);
                }}
                className="p-1.5 border-l border-[#141414]/15 hover:bg-[#141414]/10 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {view !== 'diagram' && (
            <button
              type="button"
              onClick={handleCopyMermaid}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedSvg ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedSvg ? 'Copied' : 'Copy Mermaid'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleExportFormat('png')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer"
            title="Download Mermaid ER diagram as PNG"
          >
            <span>PNG</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportFormat('svg')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer"
            title="Download Mermaid ER diagram as SVG"
          >
            <span>SVG</span>
          </button>

          <ExportMenu
            options={exportOptions}
            onExport={handleExportFormat}
            buttonLabel="Export"
            testId="er-canvas-export"
          />
        </div>
      </div>

      {/* Body — keep SVG mounted so PNG/JPEG/SVG export works from any tab */}
      <div
        className={
          view === 'diagram'
            ? 'nova-scroll overflow-auto max-h-[300px] sm:max-h-[480px] bg-[#f6f4ef]'
            : 'sr-only'
        }
        aria-hidden={view !== 'diagram'}
      >
          <svg
            ref={svgRef}
            width={Math.round(layout.width * zoom)}
            height={Math.round(layout.height * zoom)}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            xmlns="http://www.w3.org/2000/svg"
            className="block min-w-full"
          >
            <defs>
              <pattern id="novaErGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(20,20,20,0.06)"
                  strokeWidth="1"
                />
              </pattern>
              <linearGradient id="erHeaderAccent" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffb347" />
                <stop offset="50%" stopColor="#ff5a5f" />
                <stop offset="100%" stopColor="#ff3d8b" />
              </linearGradient>
            </defs>

            <rect width={layout.width} height={layout.height} fill="url(#novaErGrid)" />

            {/* Relationship Curves */}
            {layout.edges.map((edge) => {
              const isHighlighted =
                !selectedEntity ||
                edge.relationship.fromEntity.toLowerCase() === selectedEntity.toLowerCase() ||
                edge.relationship.toEntity.toLowerCase() === selectedEntity.toLowerCase();

              return (
                <g key={edge.relationship.id} opacity={isHighlighted ? 1 : 0.2}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={selectedEntity && isHighlighted ? '#ff5a5f' : '#141414'}
                    strokeOpacity={selectedEntity && isHighlighted ? 0.95 : 0.48}
                    strokeWidth={selectedEntity && isHighlighted ? 2 : 1.4}
                  />
                  <circle cx={edge.fromX} cy={edge.fromY} r="3.5" fill="#ff8a3d" />
                  <circle cx={edge.toX} cy={edge.toY} r="3.5" fill="#141414" />

                  {/* Cardinality markers near endpoints */}
                  <text
                    x={edge.fromX + (edge.toX >= edge.fromX ? 10 : -14)}
                    y={edge.fromY - 6}
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="600"
                    fill="#141414"
                  >
                    {edge.fromCardinality}
                  </text>
                  <text
                    x={edge.toX + (edge.toX >= edge.fromX ? -14 : 10)}
                    y={edge.toY - 6}
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="600"
                    fill="#141414"
                  >
                    {edge.toCardinality}
                  </text>

                  {edge.relationship.label && (
                    <g>
                      <rect
                        x={edge.labelX - 34}
                        y={edge.labelY - 10}
                        width="68"
                        height="16"
                        rx="2"
                        fill="#efece6"
                        stroke="rgba(20,20,20,0.16)"
                        strokeWidth="1"
                      />
                      <text
                        x={edge.labelX}
                        y={edge.labelY + 1}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontFamily="IBM Plex Mono, monospace"
                        fill="#141414"
                      >
                        {edge.relationship.label.slice(0, 11)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Entity Boxes */}
            {layout.nodes.map((node) => {
              const isSelected =
                selectedEntity?.toLowerCase() === node.entity.name.toLowerCase();
              return (
                <g
                  key={node.entity.id}
                  onClick={() =>
                    setSelectedEntity((prev) =>
                      prev?.toLowerCase() === node.entity.name.toLowerCase()
                        ? null
                        : node.entity.name
                    )
                  }
                  style={{ cursor: 'pointer' }}
                >
                  {/* Container */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="4"
                    fill="#efece6"
                    stroke={isSelected ? '#ff5a5f' : '#141414'}
                    strokeOpacity={isSelected ? 1 : 0.32}
                    strokeWidth={isSelected ? 1.8 : 1.1}
                  />

                  {/* Top gradient accent rule */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height="3"
                    fill="url(#erHeaderAccent)"
                  />

                  {/* Header */}
                  <rect
                    x={node.x + 1}
                    y={node.y + 3}
                    width={node.width - 2}
                    height={node.headerHeight - 3}
                    fill="#141414"
                  />
                  <text
                    x={node.x + 12}
                    y={node.y + 26}
                    fontSize="12.5"
                    fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="#efece6"
                  >
                    {node.entity.name}
                  </text>

                  {/* Columns */}
                  {node.entity.columns.map((col, idx) => {
                    const rowTop = node.y + node.headerHeight + idx * node.rowHeight;
                    const textY = rowTop + 18;
                    const keyLabel = col.isPrimaryKey ? 'PK' : col.isForeignKey ? 'FK' : col.isUnique ? 'UQ' : '';
                    return (
                      <g key={col.name}>
                        {idx > 0 && (
                          <line
                            x1={node.x + 8}
                            y1={rowTop}
                            x2={node.x + node.width - 8}
                            y2={rowTop}
                            stroke="rgba(20,20,20,0.09)"
                            strokeWidth="1"
                          />
                        )}
                        {keyLabel && (
                          <text
                            x={node.x + 10}
                            y={textY}
                            fontSize="9.5"
                            fontWeight="600"
                            fontFamily="IBM Plex Mono, monospace"
                            fill={col.isPrimaryKey ? '#ff5a5f' : '#ff8a3d'}
                          >
                            {keyLabel}
                          </text>
                        )}
                        <text
                          x={node.x + (keyLabel ? 32 : 12)}
                          y={textY}
                          fontSize="11.5"
                          fontFamily="Schibsted Grotesk, sans-serif"
                          fontWeight={col.isPrimaryKey ? '600' : '400'}
                          fill="#141414"
                        >
                          {col.name.length > 18 ? `${col.name.slice(0, 17)}…` : col.name}
                        </text>
                        <text
                          x={node.x + node.width - 10}
                          y={textY}
                          textAnchor="end"
                          fontSize="10"
                          fontFamily="IBM Plex Mono, monospace"
                          fill="rgba(20,20,20,0.55)"
                        >
                          {col.type.length > 12 ? `${col.type.slice(0, 11)}…` : col.type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
      </div>

      {view === 'ddl' && <SqlCodeBlock code={sqlDdl} label={`${dialect.toUpperCase()} DDL`} compact />}

      {view === 'mermaid' && (
        <SqlCodeBlock code={mermaidCode} label="Mermaid ER Syntax" language="mermaid" compact />
      )}

      {view === 'diagram' && (
        <div className="px-4 py-2 border-t border-[#141414]/12 bg-[#efece6] flex items-center justify-between font-mono-label text-[10px] text-[#141414]/55">
          <span>
            {selectedEntity
              ? `Highlighting relations for "${selectedEntity}" — click again to clear`
              : 'Click any entity table to highlight its foreign-key relations'}
          </span>
          <span>PK = Primary · FK = Foreign</span>
        </div>
      )}
    </div>
  );
};
