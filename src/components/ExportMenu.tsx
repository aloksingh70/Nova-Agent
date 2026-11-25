import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Code2, Download, FileCode, FileImage, FileText } from 'lucide-react';
import type { StudioExportFormat } from '../utils/exportStudio';

export interface ExportMenuOption {
  format: StudioExportFormat;
  label: string;
  extension: string;
  group: 'image' | 'schema';
  disabled?: boolean;
}

interface ExportMenuProps {
  options: ExportMenuOption[];
  onExport: (format: StudioExportFormat) => Promise<void> | void;
  buttonLabel?: string;
  testId?: string;
  align?: 'left' | 'right';
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  options,
  onExport,
  buttonLabel = 'Export',
  testId = 'studio-export-menu',
  align = 'right',
}) => {
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<StudioExportFormat | null>(null);
  const [lastExported, setLastExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const imageOptions = options.filter((o) => o.group === 'image');
  const schemaOptions = options.filter((o) => o.group === 'schema');

  const handleSelect = async (opt: ExportMenuOption) => {
    if (opt.disabled || busyFormat) return;
    setExportError(null);
    setBusyFormat(opt.format);
    try {
      await onExport(opt.format);
      setLastExported(opt.extension.toUpperCase());
      setOpen(false);
      window.setTimeout(() => setLastExported(null), 2200);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusyFormat(null);
    }
  };

  const renderIcon = (opt: ExportMenuOption) => {
    if (opt.group === 'image') return <FileImage className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    if (opt.format === 'sql' || opt.format === 'dbml') {
      return <FileCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
    if (opt.format === 'md') return <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    return <Code2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setExportError(null);
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border font-mono-label text-[10px] transition-colors whitespace-nowrap cursor-pointer ${
          open || lastExported
            ? 'border-[#141414] bg-[#141414] text-[#efece6]'
            : 'border-[#141414]/25 bg-[#f6f4ef] text-[#141414] hover:bg-[#141414] hover:text-[#efece6]'
        }`}
      >
        {lastExported ? (
          <Check className="w-3 h-3 text-[#ffb347]" aria-hidden="true" />
        ) : (
          <Download className="w-3 h-3" aria-hidden="true" />
        )}
        <span>
          {busyFormat
            ? `Exporting ${busyFormat.toUpperCase()}...`
            : lastExported
              ? `Saved ${lastExported}`
              : buttonLabel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export format options"
          data-testid={`${testId}-dropdown`}
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1.5 z-40 w-[min(296px,calc(100vw-2rem))] max-h-[min(360px,calc(100dvh-100px))] overflow-y-auto nova-scroll border border-[#141414]/30 bg-[#efece6] text-[#141414] shadow-lg`}
        >
          {imageOptions.length > 0 && (
            <div className="p-1.5 border-b border-[#141414]/15">
              <div className="px-2 py-1 font-mono-label text-[9px] text-[#141414]/50">
                Diagram Image Files
              </div>
              {imageOptions.map((opt) => (
                <button
                  key={opt.format}
                  type="button"
                  role="menuitem"
                  data-testid={`${testId}-opt-${opt.format}`}
                  disabled={opt.disabled || busyFormat !== null}
                  onClick={() => handleSelect(opt)}
                  className="w-full px-2 py-1.5 text-left flex items-center justify-between gap-2 text-[12px] hover:bg-[#141414] hover:text-[#efece6] disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#141414] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2 min-w-0 truncate">
                    {renderIcon(opt)}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  <span className="font-mono text-[10px] opacity-60 shrink-0">
                    .{opt.extension}
                  </span>
                </button>
              ))}
            </div>
          )}

          {schemaOptions.length > 0 && (
            <div className="p-1.5">
              <div className="px-2 py-1 font-mono-label text-[9px] text-[#141414]/50">
                SQL Scripts &amp; Schema Files
              </div>
              {schemaOptions.map((opt) => (
                <button
                  key={opt.format}
                  type="button"
                  role="menuitem"
                  data-testid={`${testId}-opt-${opt.format}`}
                  disabled={opt.disabled || busyFormat !== null}
                  onClick={() => handleSelect(opt)}
                  className="w-full px-2 py-1.5 text-left flex items-center justify-between gap-2 text-[12px] hover:bg-[#141414] hover:text-[#efece6] disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#141414] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2 min-w-0 truncate">
                    {renderIcon(opt)}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  <span className="font-mono text-[10px] opacity-60 shrink-0">
                    .{opt.extension}
                  </span>
                </button>
              ))}
            </div>
          )}

          {exportError && (
            <div
              role="alert"
              className="px-3 py-2 border-t border-[#dc2626]/30 bg-[#dc2626]/10 text-[11px] text-[#991b1b]"
            >
              {exportError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
