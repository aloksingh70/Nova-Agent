import React, { useMemo, useState } from 'react';
import { BarChart3, LineChart, PieChart, Sparkles, Download, Layers } from 'lucide-react';
import { downloadTextFile, sanitizeFilename } from '../utils/exportStudio';

export type ChartType = 'bar' | 'line' | 'kpi' | 'table';

interface DataChartGeneratorProps {
  columns: string[];
  rows: any[][];
  title?: string;
}

export const DataChartGenerator: React.FC<DataChartGeneratorProps> = ({
  columns,
  rows,
  title = 'Query Result Visualization',
}) => {
  const [chartType, setChartType] = useState<ChartType>('bar');

  // Identify candidate label column (string) and numeric column (number)
  const { labelColIdx, numColIdx, numericCols, labelCols } = useMemo(() => {
    if (rows.length === 0 || columns.length === 0) {
      return { labelColIdx: 0, numColIdx: 1, numericCols: [], labelCols: [] };
    }

    const nCols: number[] = [];
    const lCols: number[] = [];

    columns.forEach((col, idx) => {
      const sampleVal = rows[0]?.[idx];
      if (typeof sampleVal === 'number' || (!isNaN(Number(sampleVal)) && sampleVal !== '' && sampleVal !== null)) {
        nCols.push(idx);
      } else {
        lCols.push(idx);
      }
    });

    return {
      labelColIdx: lCols[0] ?? 0,
      numColIdx: nCols[0] ?? (columns.length > 1 ? 1 : 0),
      numericCols: nCols,
      labelCols: lCols,
    };
  }, [columns, rows]);

  const [selectedLabelCol, setSelectedLabelCol] = useState<number>(labelColIdx);
  const [selectedNumCol, setSelectedNumCol] = useState<number>(numColIdx);

  // Sync state if columns change
  React.useEffect(() => {
    setSelectedLabelCol(labelColIdx);
    setSelectedNumCol(numColIdx);
  }, [labelColIdx, numColIdx]);

  const chartData = useMemo(() => {
    return rows.slice(0, 15).map((r, i) => {
      const label = String(r[selectedLabelCol] ?? `Item ${i + 1}`);
      const val = Number(r[selectedNumCol]) || 0;
      return { label, val };
    });
  }, [rows, selectedLabelCol, selectedNumCol]);

  const maxVal = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.val), 1);
    return max;
  }, [chartData]);

  const sumVal = useMemo(() => {
    return chartData.reduce((acc, d) => acc + d.val, 0);
  }, [chartData]);

  const avgVal = useMemo(() => {
    return chartData.length > 0 ? (sumVal / chartData.length).toFixed(1) : 0;
  }, [chartData, sumVal]);

  const handleExportCsv = () => {
    const csvContent = [
      columns.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    downloadTextFile(csvContent, sanitizeFilename(title, 'csv'), 'text/csv;charset=utf-8');
  };

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-[12.5px] text-[#141414]/50 font-mono">
        No tabular rows available to chart. Run a SELECT query in the sandbox first.
      </div>
    );
  }

  return (
    <div className="border border-[#141414]/20 bg-[#fbf9f5] overflow-hidden flex flex-col">
      {/* Chart Toolbar */}
      <div className="p-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono-label text-[10px] text-[#141414]/70 font-semibold uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#ff5a5f]" />
            Natural-Language Data Chart
          </span>
          <span className="font-mono text-[9.5px] text-[#141414]/50">
            ({rows.length} {rows.length === 1 ? 'row' : 'rows'})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2 py-1 font-mono-label text-[9.5px] border inline-flex items-center gap-1 transition-colors cursor-pointer ${
              chartType === 'bar'
                ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/20 hover:border-[#141414]'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>Bar</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`px-2 py-1 font-mono-label text-[9.5px] border inline-flex items-center gap-1 transition-colors cursor-pointer ${
              chartType === 'line'
                ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/20 hover:border-[#141414]'
            }`}
          >
            <LineChart className="w-3 h-3" />
            <span>Line</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('kpi')}
            className={`px-2 py-1 font-mono-label text-[9.5px] border inline-flex items-center gap-1 transition-colors cursor-pointer ${
              chartType === 'kpi'
                ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/20 hover:border-[#141414]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>KPIs</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2 py-1 font-mono-label text-[9.5px] border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] inline-flex items-center gap-1 transition-colors cursor-pointer ml-1"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Axis Selectors */}
      <div className="px-3 py-2 bg-[#f6f4ef] border-b border-[#141414]/10 flex flex-wrap items-center gap-4 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[#141414]/60">Label:</span>
          <select
            value={selectedLabelCol}
            onChange={(e) => setSelectedLabelCol(Number(e.target.value))}
            className="h-6 px-1.5 bg-white border border-[#141414]/25 text-[10.5px] focus:outline-none"
          >
            {columns.map((c, i) => (
              <option key={i} value={i}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[#141414]/60">Metric:</span>
          <select
            value={selectedNumCol}
            onChange={(e) => setSelectedNumCol(Number(e.target.value))}
            className="h-6 px-1.5 bg-white border border-[#141414]/25 text-[10.5px] focus:outline-none"
          >
            {columns.map((c, i) => (
              <option key={i} value={i}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Visual Chart Viewport */}
      <div className="p-4 bg-[#fbf9f5] min-h-[220px]">
        {chartType === 'kpi' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 border border-[#141414]/15 bg-white">
              <span className="font-mono-label text-[9.5px] text-[#141414]/60 block mb-1">
                TOTAL {columns[selectedNumCol]?.toUpperCase()}
              </span>
              <span className="text-[24px] font-mono font-semibold text-[#141414]">
                {sumVal.toLocaleString()}
              </span>
            </div>
            <div className="p-3.5 border border-[#141414]/15 bg-white">
              <span className="font-mono-label text-[9.5px] text-[#141414]/60 block mb-1">
                AVERAGE PER {columns[selectedLabelCol]?.toUpperCase()}
              </span>
              <span className="text-[24px] font-mono font-semibold text-[#141414]">
                {avgVal}
              </span>
            </div>
            <div className="p-3.5 border border-[#141414]/15 bg-white">
              <span className="font-mono-label text-[9.5px] text-[#141414]/60 block mb-1">
                TOTAL DATA POINTS
              </span>
              <span className="text-[24px] font-mono font-semibold text-[#141414]">
                {chartData.length}
              </span>
            </div>
          </div>
        )}

        {chartType === 'bar' && (
          <div className="space-y-2">
            {chartData.map((d, i) => {
              const pct = Math.max(4, Math.round((d.val / maxVal) * 100));
              return (
                <div key={i} className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="w-20 sm:w-36 truncate text-[#141414]/80 text-right shrink-0" title={d.label}>
                    {d.label}
                  </span>
                  <div className="flex-1 bg-[#141414]/5 h-5 rounded-xs overflow-hidden flex items-center relative">
                    <div
                      style={{ width: `${pct}%` }}
                      className="bg-[#141414] h-full transition-all duration-300 rounded-xs flex items-center justify-end px-2"
                    />
                    <span className="ml-2 text-[10.5px] text-[#141414] font-medium font-mono tabular-nums">
                      {d.val.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {chartType === 'line' && (
          <div className="h-44 w-full flex items-end gap-2 pt-6 pb-2 border-b border-[#141414]/20 px-2">
            {chartData.map((d, i) => {
              const heightPct = Math.max(10, Math.round((d.val / maxVal) * 85));
              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <span className="text-[9px] font-mono text-[#141414]/70 opacity-0 group-hover:opacity-100 transition-opacity mb-1 tabular-nums">
                    {d.val}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full max-w-[28px] bg-[#141414] hover:bg-[#ff5a5f] transition-all rounded-t-xs"
                  />
                  <span className="text-[9px] font-mono text-[#141414]/60 truncate w-full text-center mt-1" title={d.label}>
                    {d.label.slice(0, 6)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
