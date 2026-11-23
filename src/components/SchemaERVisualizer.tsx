import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Database,
  GitBranch,
  GitCompareArrows,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { NovaMode, SqlDialect } from '../types/nova';
import { erDiagramToSQL } from '../utils/erLayout';
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
import {
  SCHEMA_DIFF_PRESETS,
  diffSqlSchemas,
  type DiffStatus,
} from '../utils/schemaDiff';
import { BROKEN_DEBUG_SCHEMA_DDL, parseSqlDdl } from '../utils/sqlDdlParser';
import { PRESET_SCHEMAS } from '../utils/sqlFormatter';
import { ExportMenu, type ExportMenuOption } from './ExportMenu';
import { SqlCodeBlock } from './SqlCodeBlock';

export type VisualizerTab = 'mermaid' | 'diff' | 'code';

interface SchemaERVisualizerProps {
  dialect: SqlDialect;
  schemaContext: string;
  loading: boolean;
  initialTab?: VisualizerTab;
  onSyncSchemaContext: (ddl: string) => void;
  onRunSchemaAudit: (prompt: string, targetMode: NovaMode) => void;
}

const DIFF_SVG_STYLES: Record<
  Exclude<DiffStatus, 'unchanged'>,
  { stroke: string; headerFill: string; rowOdd: string; rowEven: string; dash?: string; labelBg: string }
> = {
  added: {
    stroke: '#15803d',
    headerFill: '#dcfce7',
    rowOdd: '#f0fdf4',
    rowEven: '#dcfce7',
    labelBg: '#dcfce7',
  },
  removed: {
    stroke: '#dc2626',
    headerFill: '#fee2e2',
    rowOdd: '#fef2f2',
    rowEven: '#fee2e2',
    dash: '6 4',
    labelBg: '#fee2e2',
  },
  modified: {
    stroke: '#d97706',
    headerFill: '#fef3c7',
    rowOdd: '#fffbeb',
    rowEven: '#fef3c7',
    labelBg: '#fef3c7',
  },
};

let mermaidInitialized = false;

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: 'base',
    fontFamily: '"IBM Plex Mono", "Schibsted Grotesk", monospace',
    er: {
      diagramPadding: 20,
      layoutDirection: 'TB',
      minEntityWidth: 130,
      minEntityHeight: 75,
      entityPadding: 14,
      stroke: '#141414',
      fill: '#efece6',
      fontSize: 12,
      useMaxWidth: false,
    },
    themeVariables: {
      background: '#f6f4ef',
      primaryColor: '#efece6',
      primaryBorderColor: '#141414',
      primaryTextColor: '#141414',
      secondaryColor: '#f6f4ef',
      tertiaryColor: '#efece6',
      lineColor: '#141414',
      textColor: '#141414',
      attributeBackgroundColorOdd: '#f6f4ef',
      attributeBackgroundColorEven: '#efece6',
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '12px',
    },
  });
  mermaidInitialized = true;
}

const DDL_PRESETS = [
  ...PRESET_SCHEMAS,
  {
    id: 'broken-debug',
    name: 'Broken Schema Debug',
    ddl: BROKEN_DEBUG_SCHEMA_DDL,
  },
];

export const SchemaERVisualizer: React.FC<SchemaERVisualizerProps> = ({
  dialect,
  schemaContext,
  loading,
  initialTab = 'mermaid',
  onSyncSchemaContext,
  onRunSchemaAudit,
}) => {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [ddl, setDdl] = useState<string>(() =>
    schemaContext.trim() ? schemaContext : PRESET_SCHEMAS[0].ddl
  );
  const [baseDiffDdl, setBaseDiffDdl] = useState<string>(() => SCHEMA_DIFF_PRESETS[0].baseDdl);
  const [targetDiffDdl, setTargetDiffDdl] = useState<string>(() => SCHEMA_DIFF_PRESETS[0].targetDdl);
  const [showMigrationSql, setShowMigrationSql] = useState(false);
  const [onlyDiffChanges, setOnlyDiffChanges] = useState(false);
  const [focusedDiffTable, setFocusedDiffTable] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<VisualizerTab>(initialTab);
  const [lastVisualTab, setLastVisualTab] = useState<'mermaid' | 'diff'>(
    initialTab === 'diff' ? 'diff' : 'mermaid'
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const [renderedSvg, setRenderedSvg] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copiedMermaid, setCopiedMermaid] = useState(false);
  const [syncedNotice, setSyncedNotice] = useState(false);

  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const renderCounterRef = useRef(0);

  // Sync external initialTab switches (e.g. clicking top-level "Schema Diff" toolbar button)
  useEffect(() => {
    setActiveTab(initialTab);
    if (initialTab === 'mermaid' || initialTab === 'diff') {
      setLastVisualTab(initialTab);
    }
    setSelectedTable(null);
    setFocusedDiffTable(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [initialTab]);

  // Sync incoming non-empty schemaContext changes when user loads presets from Schema Drawer
  useEffect(() => {
    if (schemaContext.trim() && schemaContext !== ddl) {
      setDdl(schemaContext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaContext]);

  const parsed = useMemo(() => parseSqlDdl(ddl), [ddl]);
  const diffResult = useMemo(
    () => diffSqlSchemas(baseDiffDdl, targetDiffDdl, dialect, { onlyChanges: onlyDiffChanges }),
    [baseDiffDdl, targetDiffDdl, dialect, onlyDiffChanges]
  );

  const isDiffMode = activeTab === 'diff';
  const showingDiffSource = isDiffMode || (activeTab === 'code' && lastVisualTab === 'diff');
  const activeMermaidCode = showingDiffSource ? diffResult.mergedMermaidCode : parsed.mermaidCode;

  // Clear selectedTable if it no longer exists in parsed DDL
  useEffect(() => {
    if (
      selectedTable &&
      !parsed.diagram.entities.some(
        (e) => e.name.toLowerCase() === selectedTable.toLowerCase()
      )
    ) {
      setSelectedTable(null);
    }
  }, [parsed.diagram.entities, selectedTable]);

  // Render Mermaid.js ER diagram whenever activeMermaidCode updates
  useEffect(() => {
    let cancelled = false;
    const code = activeMermaidCode.trim();

    if (!code) {
      setRenderedSvg('');
      setRenderError(null);
      return;
    }

    ensureMermaidInitialized();
    const renderSeq = ++renderCounterRef.current;
    const diagramId = `nova_er_${reactId}_${renderSeq}`;

    (async () => {
      try {
        const { svg } = await mermaid.render(diagramId, code);
        if (!cancelled) {
          setRenderedSvg(svg);
          setRenderError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Mermaid could not render this ER diagram.';
          setRenderError(msg);
          setRenderedSvg('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeMermaidCode, reactId]);

  // Style rendered Mermaid SVG entity boxes (interactive inspection in ER mode, visual color diff in Diff mode)
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container || !renderedSvg) return;

    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    // Keep Mermaid SVG height proportional to rendered width so wide ER diagrams don't letterbox vertically
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';

    const entityNames = isDiffMode
      ? diffResult.tables.map((t) => t.name)
      : parsed.diagram.entities.map((e) => e.name);

    const groups = Array.from(svgEl.querySelectorAll('g')).filter((g) => {
      const id = (g.getAttribute('id') || '').toLowerCase();
      return id.includes('entity-') || g.classList.contains('entityBox');
    });

    const cleanups: (() => void)[] = [];

    for (const group of groups) {
      const idAttr = (group.getAttribute('id') || '').toLowerCase();
      const matchedName = entityNames.find((name) => {
        const safe = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        return idAttr.includes(`entity-${safe}-`) || idAttr.endsWith(`entity-${safe}`);
      });

      if (!matchedName) continue;

      if (isDiffMode) {
        const status = diffResult.tableStatusMap[matchedName.toLowerCase()] ?? 'unchanged';
        group.setAttribute('data-diff-status', status);
        group.style.cursor = 'pointer';
        group.style.transition = 'opacity 160ms ease';

        if (focusedDiffTable) {
          const isFocused = focusedDiffTable.toLowerCase() === matchedName.toLowerCase();
          const isConnected =
            isFocused ||
            diffResult.foreignKeys.some(
              (fk) =>
                (fk.fromEntity.toLowerCase() === focusedDiffTable.toLowerCase() &&
                  fk.toEntity.toLowerCase() === matchedName.toLowerCase()) ||
                (fk.toEntity.toLowerCase() === focusedDiffTable.toLowerCase() &&
                  fk.fromEntity.toLowerCase() === matchedName.toLowerCase())
            );
          group.style.opacity = isConnected ? '1' : '0.3';
        } else {
          group.style.opacity = '1';
        }

        const handleDiffClick = (ev: Event) => {
          ev.stopPropagation();
          setFocusedDiffTable((prev) =>
            prev?.toLowerCase() === matchedName.toLowerCase() ? null : matchedName
          );
        };
        group.addEventListener('click', handleDiffClick);
        cleanups.push(() => group.removeEventListener('click', handleDiffClick));

        if (status !== 'unchanged') {
          const palette = DIFF_SVG_STYLES[status];
          const outerPathGroup = group.querySelector('g.outer-path');
          if (outerPathGroup) {
            const outerPaths = Array.from(outerPathGroup.querySelectorAll('path'));
            if (outerPaths[0]) {
              outerPaths[0].setAttribute('fill', palette.headerFill);
            }
            if (outerPaths[1]) {
              outerPaths[1].setAttribute('stroke', palette.stroke);
              outerPaths[1].setAttribute(
                'stroke-width',
                focusedDiffTable?.toLowerCase() === matchedName.toLowerCase() ? '3.4' : '2.5'
              );
              if (palette.dash) {
                outerPaths[1].setAttribute('stroke-dasharray', palette.dash);
              }
            }
          }

          group.querySelectorAll('g.row-rect-odd path[stroke="none"]').forEach((p) => {
            p.setAttribute('fill', palette.rowOdd);
          });
          group.querySelectorAll('g.row-rect-even path[stroke="none"]').forEach((p) => {
            p.setAttribute('fill', palette.rowEven);
          });
          group.querySelectorAll('g.divider path').forEach((p) => {
            p.setAttribute('stroke', palette.stroke);
          });
          // Fallback for Mermaid v10 rect entities
          const fallbackRect = group.querySelector('rect');
          if (fallbackRect && !outerPathGroup) {
            fallbackRect.setAttribute('stroke', palette.stroke);
            fallbackRect.setAttribute('stroke-width', '2.5');
            fallbackRect.setAttribute('fill', palette.headerFill);
            if (palette.dash) fallbackRect.setAttribute('stroke-dasharray', palette.dash);
          }
        }
        continue;
      }

      // Standard Mermaid ER interactive inspect mode
      const isSelected = selectedTable?.toLowerCase() === matchedName.toLowerCase();
      group.style.cursor = 'pointer';
      group.style.transition = 'opacity 160ms ease';

      if (selectedTable) {
        const isConnected =
          isSelected ||
          parsed.diagram.relationships.some(
            (r) =>
              (r.fromEntity.toLowerCase() === selectedTable.toLowerCase() &&
                r.toEntity.toLowerCase() === matchedName.toLowerCase()) ||
              (r.toEntity.toLowerCase() === selectedTable.toLowerCase() &&
                r.fromEntity.toLowerCase() === matchedName.toLowerCase())
          );
        group.style.opacity = isConnected ? '1' : '0.35';
      } else {
        group.style.opacity = '1';
      }

      const outerBorder = group.querySelector('g.outer-path path:nth-of-type(2)') ?? group.querySelector('rect');
      if (outerBorder) {
        outerBorder.setAttribute('stroke', isSelected ? '#ff5a5f' : '#141414');
        outerBorder.setAttribute('stroke-width', isSelected ? '2.4' : '1.3');
      }

      const handleClick = (ev: Event) => {
        ev.stopPropagation();
        setSelectedTable((prev) =>
          prev?.toLowerCase() === matchedName.toLowerCase() ? null : matchedName
        );
      };

      group.addEventListener('click', handleClick);
      cleanups.push(() => group.removeEventListener('click', handleClick));
    }

    // Highlight added / removed / modified Foreign Key relationship edges & labels in Schema Diff mode
    if (isDiffMode) {
      const visibleFks = onlyDiffChanges
        ? diffResult.foreignKeys.filter((fk) => fk.status !== 'unchanged')
        : diffResult.foreignKeys;
      const edgePaths = Array.from(svgEl.querySelectorAll<SVGPathElement>('path.relationshipLine'));
      edgePaths.forEach((pathEl, idx) => {
        const fk = visibleFks[idx];
        if (!fk) return;
        pathEl.setAttribute('data-diff-fk-status', fk.status);
        if (fk.status === 'unchanged') return;

        const palette = DIFF_SVG_STYLES[fk.status];
        pathEl.setAttribute('stroke', palette.stroke);
        pathEl.style.stroke = palette.stroke;
        pathEl.style.strokeWidth = '2.4px';
        if (palette.dash) {
          pathEl.style.strokeDasharray = palette.dash;
        }
      });

      const edgeLabels = Array.from(svgEl.querySelectorAll<SVGGElement>('g.edgeLabel'));
      edgeLabels.forEach((labelEl, idx) => {
        const text = (labelEl.textContent || '').trim();
        const fk = visibleFks[idx];
        const status: DiffStatus = text.startsWith('+FK')
          ? 'added'
          : text.startsWith('-FK')
            ? 'removed'
            : text.startsWith('~FK')
              ? 'modified'
              : (fk?.status ?? 'unchanged');

        if (status === 'unchanged') return;
        const palette = DIFF_SVG_STYLES[status];
        labelEl.setAttribute('data-diff-fk-status', status);
        labelEl.querySelectorAll('rect, path.background').forEach((bg) => {
          bg.setAttribute('fill', palette.labelBg);
          bg.setAttribute('stroke', 'none');
          if (bg.tagName.toLowerCase() === 'rect' && !bg.getAttribute('data-padded')) {
            const x = parseFloat(bg.getAttribute('x') || '0');
            const y = parseFloat(bg.getAttribute('y') || '0');
            const w = parseFloat(bg.getAttribute('width') || '0');
            const h = parseFloat(bg.getAttribute('height') || '0');
            if (w > 0) {
              bg.setAttribute('x', String(x - 6));
              bg.setAttribute('width', String(w + 12));
              bg.setAttribute('y', String(y - 2));
              bg.setAttribute('height', String(h + 4));
              bg.setAttribute('rx', '2');
              bg.setAttribute('data-padded', 'true');
            }
          }
        });
        labelEl.querySelectorAll('text, tspan').forEach((t) => {
          t.setAttribute('fill', palette.stroke);
          (t as SVGElement).style.fill = palette.stroke;
          (t as SVGElement).style.fontWeight = '600';
        });
      });
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [
    renderedSvg,
    selectedTable,
    focusedDiffTable,
    onlyDiffChanges,
    isDiffMode,
    diffResult,
    parsed.diagram.entities,
    parsed.diagram.relationships,
  ]);

  const selectedEntityObj = useMemo(() => {
    if (!selectedTable) return null;
    return (
      parsed.diagram.entities.find(
        (e) => e.name.toLowerCase() === selectedTable.toLowerCase()
      ) ?? null
    );
  }, [parsed.diagram.entities, selectedTable]);

  const selectedEntityRelations = useMemo(() => {
    if (!selectedEntityObj) return { outgoing: [], incoming: [] };
    const nameLower = selectedEntityObj.name.toLowerCase();
    return {
      outgoing: parsed.diagram.relationships.filter(
        (r) => r.fromEntity.toLowerCase() === nameLower
      ),
      incoming: parsed.diagram.relationships.filter(
        (r) => r.toEntity.toLowerCase() === nameLower
      ),
    };
  }, [parsed.diagram.relationships, selectedEntityObj]);

  const selectedEntityIssues = useMemo(() => {
    if (!selectedEntityObj) return [];
    const nameLower = selectedEntityObj.name.toLowerCase();
    return parsed.issues.filter((i) => i.table.toLowerCase() === nameLower);
  }, [parsed.issues, selectedEntityObj]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('g[id^="entity-"]')) return;
    setIsDragging(true);
    dragOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragOriginRef.current) return;
    const dx = e.clientX - dragOriginRef.current.x;
    const dy = e.clientY - dragOriginRef.current.y;
    setPan({
      x: dragOriginRef.current.panX + dx,
      y: dragOriginRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    dragOriginRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedTable(null);
  };

  const handleCopyMermaid = async () => {
    if (!activeMermaidCode) return;
    try {
      await navigator.clipboard.writeText(activeMermaidCode);
      setCopiedMermaid(true);
      window.setTimeout(() => setCopiedMermaid(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const exportBaseName = isDiffMode
    ? `schema-diff-${dialect}`
    : `${parsed.diagram.title || 'nova-schema'}-${dialect}`;

  const getExportableSvgMarkup = () => {
    const liveSvg = svgContainerRef.current?.querySelector('svg');
    return liveSvg ? liveSvg.outerHTML : renderedSvg;
  };

  const exportOptions: ExportMenuOption[] = useMemo(
    () => [
      {
        format: 'png',
        label: isDiffMode ? 'Diff Diagram PNG (2x)' : 'PNG Image (2x Hi-Res)',
        extension: 'png',
        group: 'image',
        disabled: !renderedSvg,
      },
      {
        format: 'svg',
        label: isDiffMode ? 'Diff Diagram SVG' : 'SVG Vector Diagram',
        extension: 'svg',
        group: 'image',
        disabled: !renderedSvg,
      },
      {
        format: 'jpeg',
        label: 'JPEG Image',
        extension: 'jpg',
        group: 'image',
        disabled: !renderedSvg,
      },
      {
        format: 'sql',
        label: isDiffMode
          ? `Migration SQL (${dialect.toUpperCase()})`
          : `Parsed SQL Schema (${dialect.toUpperCase()})`,
        extension: 'sql',
        group: 'schema',
        disabled: isDiffMode
          ? diffResult.tables.length === 0
          : parsed.diagram.entities.length === 0 && !ddl.trim(),
      },
      {
        format: 'mmd',
        label: isDiffMode ? 'Diff Mermaid Source' : 'Mermaid ER Source',
        extension: 'mmd',
        group: 'schema',
        disabled: !activeMermaidCode,
      },
      {
        format: 'dbml',
        label: 'DBML Schema',
        extension: 'dbml',
        group: 'schema',
        disabled: parsed.diagram.entities.length === 0,
      },
      {
        format: 'md',
        label: 'Markdown Spec Bundle',
        extension: 'md',
        group: 'schema',
        disabled: !ddl.trim() && parsed.diagram.entities.length === 0,
      },
      {
        format: 'json',
        label: 'JSON Schema Metadata',
        extension: 'json',
        group: 'schema',
        disabled: parsed.diagram.entities.length === 0,
      },
    ],
    [
      isDiffMode,
      renderedSvg,
      dialect,
      ddl,
      activeMermaidCode,
      diffResult.tables.length,
      parsed.diagram.entities.length,
    ]
  );

  const handleExportFormat = async (format: StudioExportFormat) => {
    const svgToExport = getExportableSvgMarkup();
    switch (format) {
      case 'png': {
        if (!svgToExport) return;
        await downloadSvgAsRasterImage(
          svgToExport,
          sanitizeFilename(exportBaseName, 'png'),
          'png',
          2
        );
        return;
      }
      case 'jpeg': {
        if (!svgToExport) return;
        await downloadSvgAsRasterImage(
          svgToExport,
          sanitizeFilename(exportBaseName, 'jpg'),
          'jpeg',
          2
        );
        return;
      }
      case 'svg': {
        if (!svgToExport) return;
        const { markup } = prepareStandaloneSvg(svgToExport, { background: '#f6f4ef' });
        downloadTextFile(
          markup,
          sanitizeFilename(exportBaseName, 'svg'),
          'image/svg+xml;charset=utf-8'
        );
        return;
      }
      case 'sql': {
        const sqlBody = isDiffMode
          ? diffResult.migrationSql
          : parsed.diagram.entities.length > 0
            ? erDiagramToSQL(parsed.diagram, dialect)
            : ddl.trim();
        const script = buildSqlScriptExport(sqlBody, {
          title: isDiffMode
            ? 'NOVA Studio Schema Diff Migration'
            : parsed.diagram.title || 'NOVA Studio Parsed Schema',
          dialect,
        });
        downloadTextFile(
          script,
          sanitizeFilename(exportBaseName, 'sql'),
          'application/sql;charset=utf-8'
        );
        return;
      }
      case 'mmd': {
        if (!activeMermaidCode) return;
        downloadTextFile(
          `${activeMermaidCode.trim()}\n`,
          sanitizeFilename(exportBaseName, 'mmd'),
          'text/plain;charset=utf-8'
        );
        return;
      }
      case 'dbml': {
        const dbml = buildDbmlExport(parsed.diagram);
        downloadTextFile(
          dbml,
          sanitizeFilename(exportBaseName, 'dbml'),
          'text/plain;charset=utf-8'
        );
        return;
      }
      case 'md': {
        const md = buildMarkdownSpecExport(parsed.diagram, dialect, ddl, parsed.mermaidCode);
        downloadTextFile(
          md,
          sanitizeFilename(exportBaseName, 'md'),
          'text/markdown;charset=utf-8'
        );
        return;
      }
      case 'json': {
        const json = buildJsonSchemaExport(parsed.diagram, dialect);
        downloadTextFile(
          json,
          sanitizeFilename(exportBaseName, 'json'),
          'application/json;charset=utf-8'
        );
        return;
      }
    }
  };

  const handleSyncContext = () => {
    onSyncSchemaContext(ddl);
    setSyncedNotice(true);
    window.setTimeout(() => setSyncedNotice(false), 1800);
  };

  const handleAiAudit = () => {
    if (!ddl.trim() || loading) return;
    const issuesSummary = parsed.issues
      .map((i) => `- [${i.severity}] ${i.table}${i.column ? `.${i.column}` : ''}: ${i.title}`)
      .join('\n');

    const prompt = [
      `Target SQL dialect: ${dialect.toUpperCase()}`,
      `Audit and debug this SQL DDL schema:\n\`\`\`sql\n${ddl.trim()}\n\`\`\``,
      issuesSummary ? `Detected schema diagnostics:\n${issuesSummary}` : '',
      'Fix all referential integrity errors, key/type mismatches, missing primary keys, and add recommended foreign-key indexes.',
    ]
      .filter(Boolean)
      .join('\n\n');

    onRunSchemaAudit(prompt, 'schema-builder');
  };

  return (
    <section
      aria-label="SQL DDL ER Diagram Visualizer and Schema Debugger"
      data-testid="schema-er-visualizer"
      className="border border-[#141414]/25 bg-[#f6f4ef]"
    >
      {/* Top Bar: Title + Presets */}
      <div className="px-4 py-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-[#141414] flex items-center gap-2">
            <GitBranch className="w-4 h-4 shrink-0" />
            <span>SQL DDL ER Visualizer &amp; Schema Debugger</span>
          </h2>
          <p className="text-[12.5px] text-[#141414]/65">
            Live SQL DDL parser rendered with Mermaid.js — inspect keys, relations, and referential bugs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isDiffMode
            ? SCHEMA_DIFF_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setBaseDiffDdl(preset.baseDdl);
                    setTargetDiffDdl(preset.targetDdl);
                    setPan({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                  className="px-2.5 py-1 border border-[#141414]/25 bg-[#f6f4ef] text-[#141414] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {preset.name}
                </button>
              ))
            : DDL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setDdl(preset.ddl);
                    setSelectedTable(null);
                    setPan({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                  className={`px-2.5 py-1 border font-mono-label text-[9.5px] transition-colors whitespace-nowrap cursor-pointer ${
                    preset.id === 'broken-debug'
                      ? 'border-[#dc2626]/45 bg-[#dc2626]/5 text-[#991b1b] hover:bg-[#dc2626] hover:text-white'
                      : 'border-[#141414]/20 bg-[#f6f4ef] text-[#141414] hover:bg-[#141414] hover:text-[#efece6]'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
        </div>
      </div>

      {/* Main Split: SQL DDL Editor / Dual Diff Editors (left) + Interactive Mermaid ER Canvas (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] border-b border-[#141414]/15">
        {/* Left: Single SQL DDL Editor OR Dual v1/v2 Schema Diff Editors */}
        {isDiffMode ? (
          <div
            data-testid="schema-diff-editors"
            className="p-4 border-b xl:border-b-0 xl:border-r border-[#141414]/15 flex flex-col gap-3 bg-[#f6f4ef]"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="schema-diff-base-input"
                className="font-mono-label text-[10px] text-[#141414]/75"
              >
                Version A — Base Schema (v1)
              </label>
              <button
                type="button"
                onClick={() => setBaseDiffDdl(ddl)}
                className="font-mono-label text-[9px] text-[#141414]/65 hover:text-[#141414] underline underline-offset-2 cursor-pointer"
              >
                Use Current DDL
              </button>
            </div>
            <textarea
              id="schema-diff-base-input"
              data-testid="schema-diff-base-input"
              value={baseDiffDdl}
              onChange={(e) => setBaseDiffDdl(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="Paste Base (v1) CREATE TABLE SQL DDL..."
              className="w-full p-2.5 bg-[#19191c] text-[#f3f0ea] border border-[#dc2626]/35 font-mono text-[11.5px] leading-[1.5] focus:outline-none focus:border-[#dc2626] resize-y"
            />

            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="schema-diff-target-input"
                className="font-mono-label text-[10px] text-[#141414]/75"
              >
                Version B — Target Schema (v2)
              </label>
              <button
                type="button"
                data-testid="schema-diff-swap-btn"
                onClick={() => {
                  const prevBase = baseDiffDdl;
                  setBaseDiffDdl(targetDiffDdl);
                  setTargetDiffDdl(prevBase);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9px] transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-2.5 h-2.5" aria-hidden="true" />
                <span>Swap v1 ⇄ v2</span>
              </button>
            </div>
            <textarea
              id="schema-diff-target-input"
              data-testid="schema-diff-target-input"
              value={targetDiffDdl}
              onChange={(e) => setTargetDiffDdl(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="Paste Target (v2) CREATE TABLE SQL DDL..."
              className="w-full p-2.5 bg-[#19191c] text-[#f3f0ea] border border-[#15803d]/45 font-mono text-[11.5px] leading-[1.5] focus:outline-none focus:border-[#15803d] resize-y"
            />
          </div>
        ) : (
          <div className="p-4 border-b xl:border-b-0 xl:border-r border-[#141414]/15 flex flex-col gap-3 bg-[#f6f4ef]">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="schema-er-ddl-input"
                className="font-mono-label text-[10px] text-[#141414]/75"
              >
                SQL DDL Input ({dialect.toUpperCase()})
              </label>
              <div className="flex items-center gap-2 font-mono text-[10px] text-[#141414]/60 tabular-nums">
                <span>{parsed.stats.tableCount} tables</span>
                <span aria-hidden="true">·</span>
                <span>{parsed.stats.relationshipCount} FKs</span>
              </div>
            </div>

            <textarea
              id="schema-er-ddl-input"
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder="Paste CREATE TABLE, ALTER TABLE, and CREATE INDEX DDL statements..."
              className="w-full flex-1 min-h-[260px] p-3 bg-[#19191c] text-[#f3f0ea] border border-[#141414]/30 font-mono text-[12px] leading-[1.55] focus:outline-none focus:border-[#ff5a5f] resize-y"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!ddl.trim()}
                onClick={handleSyncContext}
                className="flex-1 h-9 px-3 border border-[#141414] bg-[#efece6] text-[#141414] hover:bg-[#141414] hover:text-[#efece6] disabled:opacity-40 font-mono-label text-[10px] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                {syncedNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Synced to Context</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Sync to Schema Context</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={loading || !ddl.trim()}
                onClick={handleAiAudit}
                className="flex-1 h-9 px-3 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] disabled:opacity-40 font-mono-label text-[10px] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>AI Schema Audit</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Right: Interactive Mermaid.js Diagram Viewport */}
        <div className="flex flex-col min-w-0 bg-[#f6f4ef]">
          {/* Diagram Toolbar */}
          <div className="px-4 py-2.5 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex border border-[#141414]/20 bg-[#f6f4ef]">
              <button
                type="button"
                data-testid="er-tab-mermaid"
                onClick={() => {
                  setActiveTab('mermaid');
                  setLastVisualTab('mermaid');
                }}
                className={`px-2.5 py-1 font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'mermaid'
                    ? 'bg-[#141414] text-[#efece6]'
                    : 'text-[#141414]/70 hover:text-[#141414]'
                }`}
              >
                Mermaid ER
              </button>
              <button
                type="button"
                data-testid="er-tab-diff"
                onClick={() => {
                  setActiveTab('diff');
                  setLastVisualTab('diff');
                  setSelectedTable(null);
                  setFocusedDiffTable(null);
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                }}
                className={`px-2.5 py-1 border-l border-[#141414]/15 font-mono-label text-[10px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'diff'
                    ? 'bg-[#141414] text-[#efece6]'
                    : 'text-[#141414]/70 hover:text-[#141414]'
                }`}
              >
                <GitCompareArrows className="w-3 h-3" aria-hidden="true" />
                <span>Schema Diff</span>
              </button>
              <button
                type="button"
                data-testid="er-tab-code"
                onClick={() => setActiveTab('code')}
                className={`px-2.5 py-1 border-l border-[#141414]/15 font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'code'
                    ? 'bg-[#141414] text-[#efece6]'
                    : 'text-[#141414]/70 hover:text-[#141414]'
                }`}
              >
                Mermaid Syntax
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTab !== 'code' && (
                <div className="inline-flex items-center border border-[#141414]/20 bg-[#f6f4ef]">
                  <button
                    type="button"
                    aria-label="Zoom out Mermaid diagram"
                    onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                    className="p-1.5 hover:bg-[#141414]/10 transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-mono text-[10px] tabular-nums text-[#141414]/80">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label="Zoom in Mermaid diagram"
                    onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
                    className="p-1.5 hover:bg-[#141414]/10 transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Reset diagram view"
                    onClick={handleResetView}
                    className="p-1.5 border-l border-[#141414]/15 hover:bg-[#141414]/10 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!activeMermaidCode}
                onClick={handleCopyMermaid}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-[#141414]/20 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] disabled:opacity-40 font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedMermaid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedMermaid ? 'Copied' : 'Copy Mermaid'}</span>
              </button>

              <ExportMenu
                options={exportOptions}
                onExport={handleExportFormat}
                buttonLabel="Export"
                testId="schema-er-export"
              />
            </div>
          </div>

          {/* Diff Legend Bar (in Schema Diff mode) OR Clickable Entity Selector Bar (in ER mode) */}
          {isDiffMode ? (
            <div
              data-testid="schema-diff-legend"
              className="px-4 py-2 border-b border-[#141414]/12 bg-[#f6f4ef] flex flex-wrap items-center justify-between gap-2 font-mono-label text-[9.5px]"
            >
              <div className="flex flex-wrap items-center gap-3 tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-[#15803d] font-semibold">
                  <span className="w-2.5 h-2.5 border border-[#15803d] bg-[#dcfce7] inline-block" />
                  <span>
                    +{diffResult.summary.tablesAdded} Tables / +{diffResult.summary.fksAdded} FKs
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#b45309] font-semibold">
                  <span className="w-2.5 h-2.5 border border-[#d97706] bg-[#fef3c7] inline-block" />
                  <span>
                    ~{diffResult.summary.tablesModified} Modified / ~{diffResult.summary.fksModified} FKs
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#dc2626] font-semibold">
                  <span className="w-2.5 h-2.5 border border-dashed border-[#dc2626] bg-[#fee2e2] inline-block" />
                  <span>
                    -{diffResult.summary.tablesRemoved} Removed / -{diffResult.summary.fksRemoved} FKs
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="schema-diff-only-changes-toggle"
                  onClick={() => setOnlyDiffChanges((v) => !v)}
                  className={`px-2 py-0.5 border font-mono-label text-[9px] transition-colors cursor-pointer ${
                    onlyDiffChanges
                      ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                      : 'bg-[#efece6] text-[#141414]/75 border-[#141414]/25 hover:border-[#141414]'
                  }`}
                >
                  {onlyDiffChanges ? 'Showing: Changes Only' : 'Changes Only'}
                </button>
                <span className="text-[#141414]/55 tabular-nums">
                  {diffResult.summary.totalChanges}{' '}
                  {diffResult.summary.totalChanges === 1 ? 'change' : 'changes'}
                </span>
              </div>
            </div>
          ) : (
            parsed.diagram.entities.length > 0 && (
              <div className="px-4 py-2 border-b border-[#141414]/12 bg-[#f6f4ef] flex items-center gap-1.5 overflow-x-auto nova-scroll">
                <span className="font-mono-label text-[9.5px] text-[#141414]/50 shrink-0 mr-1">
                  Inspect Table:
                </span>
                {parsed.diagram.entities.map((entity) => {
                  const isActive =
                    selectedTable?.toLowerCase() === entity.name.toLowerCase();
                  const tableHasCritical = parsed.issues.some(
                    (i) =>
                      i.table.toLowerCase() === entity.name.toLowerCase() &&
                      i.severity === 'Critical'
                  );
                  const tableHasWarning = parsed.issues.some(
                    (i) =>
                      i.table.toLowerCase() === entity.name.toLowerCase() &&
                      i.severity === 'Warning'
                  );
                  return (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() =>
                        setSelectedTable((prev) =>
                          prev?.toLowerCase() === entity.name.toLowerCase() ? null : entity.name
                        )
                      }
                      className={`px-2.5 py-1 border font-mono text-[11px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                          : tableHasCritical
                            ? 'bg-[#dc2626]/8 text-[#991b1b] border-[#dc2626]/40 hover:border-[#dc2626]'
                            : tableHasWarning
                              ? 'bg-[#b45309]/8 text-[#92400e] border-[#b45309]/35 hover:border-[#b45309]'
                              : 'bg-[#efece6] text-[#141414] border-[#141414]/20 hover:border-[#141414]'
                      }`}
                    >
                      {entity.name}
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* Diagram Canvas (Mermaid ER or Visual Schema Diff) OR Mermaid Code */}
          {activeTab !== 'code' ? (
            <div className="relative flex-1 min-h-[360px] max-h-[480px] overflow-hidden bg-[#f6f4ef]">
              {!activeMermaidCode.trim() ? (
                <div className="h-[340px] flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <p className="text-[14px] text-[#141414]/75 max-w-md">
                    {isDiffMode
                      ? 'Paste Base (v1) and Target (v2) SQL DDL on the left to visualize added, removed, and modified tables and foreign keys.'
                      : parsed.parseErrors[0] ||
                        'Paste SQL CREATE TABLE statements on the left or load a preset to render an interactive Mermaid.js ER diagram.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (isDiffMode) {
                        setBaseDiffDdl(SCHEMA_DIFF_PRESETS[0].baseDdl);
                        setTargetDiffDdl(SCHEMA_DIFF_PRESETS[0].targetDdl);
                      } else {
                        setDdl(PRESET_SCHEMAS[0].ddl);
                      }
                    }}
                    className="px-3.5 py-2 bg-[#141414] text-[#efece6] font-mono-label text-[10px] hover:bg-[#2a2928] transition-colors cursor-pointer"
                  >
                    {isDiffMode ? 'Load E-Commerce v1 → v2 Diff' : 'Load E-Commerce Core DDL'}
                  </button>
                </div>
              ) : renderError ? (
                <div role="alert" className="p-5 text-[13px] text-[#991b1b] space-y-1.5">
                  <div className="font-mono-label text-[10.5px] font-semibold">
                    Mermaid Render Error
                  </div>
                  <p>{renderError}</p>
                </div>
              ) : (
                <div
                  data-testid="mermaid-er-canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`w-full h-[380px] overflow-auto nova-scroll select-none ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(20,20,20,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,20,20,0.05) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                >
                  <div
                    ref={svgContainerRef}
                    data-testid="mermaid-er-svg"
                    className="min-w-full min-h-full p-5 flex items-start justify-center origin-top transition-transform duration-100"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    }}
                    dangerouslySetInnerHTML={{ __html: renderedSvg }}
                  />
                </div>
              )}

              {renderedSvg && (
                <div className="px-4 py-1.5 border-t border-[#141414]/12 bg-[#efece6] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono-label text-[9.5px] text-[#141414]/55">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Move className="w-3 h-3 shrink-0" />
                    <span>
                      {isDiffMode
                        ? 'Green: added · Amber: modified · Red dashed: removed'
                        : 'Drag canvas to pan · Click any table to inspect columns & FKs'}
                    </span>
                  </span>
                  <span className="tabular-nums shrink-0 whitespace-nowrap">
                    {isDiffMode
                      ? `${diffResult.tables.length} tables compared · ${diffResult.foreignKeys.length} FKs`
                      : `${parsed.stats.columnCount} columns · ${parsed.stats.indexCount} indexes`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <SqlCodeBlock
                code={
                  activeMermaidCode ||
                  '// Paste SQL DDL to generate Mermaid erDiagram syntax'
                }
                label={
                  showingDiffSource
                    ? 'Generated Schema Diff Mermaid erDiagram Syntax'
                    : 'Generated Mermaid erDiagram Syntax'
                }
                language="mermaid"
                compact
              />
            </div>
          )}
        </div>
      </div>

      {/* Schema Diff Detailed Breakdown + Migration SQL (in Schema Diff mode) */}
      {isDiffMode && (
        <div
          data-testid="schema-diff-breakdown"
          className="p-4 border-b border-[#141414]/15 bg-[#efece6] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-mono-label text-[10.5px] text-[#141414]/80">
                Schema Diff Breakdown ({diffResult.summary.totalChanges} changes)
              </h3>
              {focusedDiffTable && (
                <button
                  type="button"
                  onClick={() => setFocusedDiffTable(null)}
                  className="font-mono-label text-[9px] text-[#ff5a5f] hover:underline cursor-pointer"
                >
                  Clear focus ({focusedDiffTable})
                </button>
              )}
            </div>
            <button
              type="button"
              data-testid="toggle-migration-sql-btn"
              onClick={() => setShowMigrationSql((v) => !v)}
              className="px-2.5 py-1 border border-[#141414]/25 bg-[#f6f4ef] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] transition-colors cursor-pointer"
            >
              {showMigrationSql ? 'Hide Migration SQL' : 'Preview Migration SQL'}
            </button>
          </div>

          {diffResult.summary.totalChanges === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-[#15803d]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Version A and Version B are structurally identical — no table or foreign key differences detected.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Table & Column Changes */}
              <div className="border border-[#141414]/15 bg-[#f6f4ef] p-3 space-y-2">
                <div className="font-mono-label text-[9.5px] text-[#141414]/60">
                  Table &amp; Column Changes (click table to highlight in diagram)
                </div>
                <ul className="space-y-2 text-[12px]">
                  {diffResult.tables
                    .filter((t) => t.status !== 'unchanged')
                    .map((t) => {
                      const isFocused = focusedDiffTable?.toLowerCase() === t.name.toLowerCase();
                      return (
                        <li key={t.name} className="space-y-1">
                          <button
                            type="button"
                            onClick={() =>
                              setFocusedDiffTable((prev) =>
                                prev?.toLowerCase() === t.name.toLowerCase() ? null : t.name
                              )
                            }
                            className={`flex items-center gap-2 font-mono text-left px-1 -mx-1 py-0.5 transition-colors cursor-pointer ${
                              isFocused ? 'bg-[#141414] text-[#efece6]' : 'hover:bg-[#efece6]'
                            }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 text-[9.5px] font-semibold uppercase border ${
                                t.status === 'added'
                                  ? 'bg-[#dcfce7] text-[#15803d] border-[#15803d]/40'
                                  : t.status === 'removed'
                                    ? 'bg-[#fee2e2] text-[#dc2626] border-[#dc2626]/40'
                                    : 'bg-[#fef3c7] text-[#b45309] border-[#d97706]/40'
                              }`}
                            >
                              {t.status}
                            </span>
                            <span className="font-semibold">{t.name}</span>
                          </button>
                        {t.status === 'modified' && (
                          <ul className="pl-4 space-y-0.5 font-mono text-[11px]">
                            {t.columns
                              .filter((c) => c.status !== 'unchanged')
                              .map((c) => (
                                <li
                                  key={c.name}
                                  className={
                                    c.status === 'added'
                                      ? 'text-[#15803d]'
                                      : c.status === 'removed'
                                        ? 'text-[#dc2626]'
                                        : 'text-[#b45309]'
                                  }
                                >
                                  {c.status === 'added' ? '+' : c.status === 'removed' ? '-' : '~'}{' '}
                                  {c.name}{' '}
                                  {c.status === 'modified'
                                    ? `(${c.changes.join(', ')})`
                                    : c.after?.type || c.before?.type}
                                </li>
                              ))}
                          </ul>
                        )}
                        </li>
                      );
                    })}
                </ul>
              </div>

              {/* Foreign Key Changes */}
              <div className="border border-[#141414]/15 bg-[#f6f4ef] p-3 space-y-2">
                <div className="font-mono-label text-[9.5px] text-[#141414]/60">
                  Foreign Key Relationship Changes
                </div>
                {diffResult.foreignKeys.filter((f) => f.status !== 'unchanged').length === 0 ? (
                  <p className="text-[12px] text-[#141414]/60">
                    No foreign key relationships were added, removed, or re-targeted.
                  </p>
                ) : (
                  <ul className="space-y-1.5 font-mono text-[11.5px]">
                    {diffResult.foreignKeys
                      .filter((f) => f.status !== 'unchanged')
                      .map((fk) => (
                        <li
                          key={fk.key}
                          className={`flex items-center gap-2 ${
                            fk.status === 'added'
                              ? 'text-[#15803d]'
                              : fk.status === 'removed'
                                ? 'text-[#dc2626]'
                                : 'text-[#b45309]'
                          }`}
                        >
                          <span className="font-semibold">
                            {fk.status === 'added' ? '+FK' : fk.status === 'removed' ? '-FK' : '~FK'}
                          </span>
                          <span>
                            {fk.fromEntity}.{fk.fromColumn} → {fk.toEntity}.{fk.toColumn}
                            {fk.previousTarget ? ` (was ${fk.previousTarget})` : ''}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {showMigrationSql && (
            <SqlCodeBlock
              code={diffResult.migrationSql}
              label={`Generated Migration SQL (${dialect.toUpperCase()})`}
              language="sql"
              compact
            />
          )}
        </div>
      )}

      {/* Interactive Selected Entity Inspector */}
      {selectedEntityObj && (
        <div
          data-testid="entity-inspector"
          className="px-4 py-3.5 border-b border-[#141414]/15 bg-[#efece6] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold text-[#141414]">
                {selectedEntityObj.name}
              </span>
              <span className="font-mono-label text-[10px] text-[#141414]/55 tabular-nums">
                {selectedEntityObj.columns.length} columns ·{' '}
                {selectedEntityRelations.outgoing.length} outgoing FKs ·{' '}
                {selectedEntityRelations.incoming.length} incoming FKs
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTable(null)}
              className="font-mono-label text-[10px] text-[#141414]/65 hover:text-[#141414] underline underline-offset-2 cursor-pointer"
            >
              Clear Selection
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Column Table */}
            <div className="border border-[#141414]/15 bg-[#f6f4ef] overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#141414]/15 font-mono-label text-[9.5px] text-[#141414]/60">
                    <th className="py-1.5 px-2.5">Column</th>
                    <th className="py-1.5 px-2.5">Type</th>
                    <th className="py-1.5 px-2.5">Constraints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/10 font-mono">
                  {selectedEntityObj.columns.map((col) => {
                    const flags: string[] = [];
                    if (col.isPrimaryKey) flags.push('PK');
                    if (col.isForeignKey) flags.push('FK');
                    if (col.isUnique && !col.isPrimaryKey) flags.push('UQ');
                    flags.push(col.isNullable ? 'NULL' : 'NOT NULL');
                    return (
                      <tr key={col.name}>
                        <td className="py-1.5 px-2.5 font-medium text-[#141414]">{col.name}</td>
                        <td className="py-1.5 px-2.5 text-[#141414]/70">{col.type}</td>
                        <td className="py-1.5 px-2.5 text-[10.5px] text-[#141414]/75">
                          {flags.join(' · ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Relations + Table Diagnostics */}
            <div className="space-y-2.5 text-[12.5px]">
              <div className="border border-[#141414]/15 bg-[#f6f4ef] p-3 space-y-1.5">
                <div className="font-mono-label text-[9.5px] text-[#141414]/60">
                  Foreign-Key Relationships
                </div>
                {selectedEntityRelations.outgoing.length === 0 &&
                selectedEntityRelations.incoming.length === 0 ? (
                  <p className="text-[#141414]/60">
                    No incoming or outgoing foreign keys detected for this table.
                  </p>
                ) : (
                  <ul className="space-y-1 font-mono text-[11.5px]">
                    {selectedEntityRelations.outgoing.map((r) => (
                      <li key={r.id}>
                        <span className="text-[#ff5a5f]">OUT</span> {r.fromEntity}.{r.fromColumn} →{' '}
                        {r.toEntity}.{r.toColumn} ({r.cardinality})
                      </li>
                    ))}
                    {selectedEntityRelations.incoming.map((r) => (
                      <li key={r.id}>
                        <span className="text-[#141414]/60">IN</span> {r.fromEntity}.{r.fromColumn}{' '}
                        → {r.toEntity}.{r.toColumn} ({r.cardinality})
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedEntityIssues.length > 0 && (
                <div className="border border-[#dc2626]/25 bg-[#dc2626]/5 p-3 space-y-1">
                  <div className="font-mono-label text-[9.5px] text-[#991b1b]">
                    Table Diagnostics ({selectedEntityIssues.length})
                  </div>
                  {selectedEntityIssues.map((iss) => (
                    <p key={iss.id} className="text-[12px] text-[#141414]/85">
                      <span className="font-mono font-semibold text-[#991b1b] mr-1.5">
                        [{iss.severity}]
                      </span>
                      {iss.title}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Schema Debugger Findings (shown in single-schema ER mode) */}
      {!isDiffMode && (
        <div className="p-4 space-y-3" data-testid="schema-debugger-findings">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono-label text-[10.5px] text-[#141414]/75">
              Schema Debugging Diagnostics ({parsed.issues.length})
            </h3>
            <span className="font-mono-label text-[10px] text-[#141414]/60 tabular-nums">
              {parsed.stats.criticalCount} critical · {parsed.stats.warningCount} warnings
            </span>
          </div>

          {parsed.issues.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-[#15803d]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Schema passed all static referential integrity, primary key, type-matching, and
                foreign-key indexing checks.
              </span>
            </div>
          ) : (
            <div className="border-t border-[#141414]/15 divide-y divide-[#141414]/12">
              {parsed.issues.map((issue) => (
                <div
                  key={issue.id}
                  className="py-2.5 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-2"
                >
                  <div>
                    <div
                      className={`font-mono-label text-[10px] font-semibold flex items-center gap-1.5 ${
                        issue.severity === 'Critical'
                          ? 'text-[#dc2626]'
                          : issue.severity === 'Warning'
                            ? 'text-[#b45309]'
                            : 'text-[#141414]/70'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{issue.severity}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTable(issue.table)}
                      className="font-mono text-[11px] text-[#141414]/70 hover:text-[#141414] underline underline-offset-2 mt-0.5 cursor-pointer"
                    >
                      {issue.table}
                      {issue.column ? `.${issue.column}` : ''}
                    </button>
                  </div>

                  <div className="space-y-0.5 text-[12.5px] leading-[1.5]">
                    <div className="font-medium text-[#141414]">{issue.title}</div>
                    <p className="text-[#141414]/75">{issue.detail}</p>
                    <p className="text-[#141414]/90 font-mono text-[11.5px]">
                      Fix: {issue.suggestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
