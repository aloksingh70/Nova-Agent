import React, { useMemo, useState } from 'react';
import {
  Play,
  RotateCcw,
  Sparkles,
  Table as TableIcon,
  BarChart3,
  Clock,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { InMemorySqlDatabase, generateRealisticSeedData, type QueryResult } from '../utils/inMemorySqlEngine';
import { DataChartGenerator } from './DataChartGenerator';

interface LiveSqlSandboxProps {
  initialSql?: string;
  schemaContext?: string;
  onSendToChat?: (sql: string) => void;
}

const DEFAULT_SANDBOX_SCRIPT = `-- 1. Schema Definition
CREATE TABLE products (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  category VARCHAR(50),
  price DECIMAL(10, 2),
  stock INT
);

-- 2. Mock Records
INSERT INTO products (id, name, category, price, stock) VALUES
  (1, 'Nova AI Query Pro', 'Software', 499.00, 150),
  (2, 'Cloud Database Connector', 'Hardware', 89.50, 42),
  (3, 'Vector Index Accelerator', 'Software', 249.00, 80),
  (4, 'High-Throughput NVMe Cache', 'Hardware', 620.00, 15),
  (5, 'Schema Studio Enterprise', 'Software', 990.00, 30);

-- 3. Live Analytical Query
SELECT category, COUNT(*) AS total_products, AVG(price) AS avg_price, SUM(price * stock) AS inventory_value
FROM products
WHERE stock > 20
GROUP BY category
ORDER BY inventory_value DESC;`;

export const LiveSqlSandbox: React.FC<LiveSqlSandboxProps> = ({
  initialSql = DEFAULT_SANDBOX_SCRIPT,
  schemaContext = '',
  onSendToChat,
}) => {
  const [sql, setSql] = useState<string>(initialSql);
  const [activeTab, setActiveTab] = useState<'table' | 'chart'>('table');
  const [copied, setCopied] = useState(false);

  // In-memory relational engine instance
  const db = useMemo(() => new InMemorySqlDatabase(), []);

  // Execution result state
  const [result, setResult] = useState<QueryResult>(() => db.execute(initialSql));

  const handleRun = () => {
    db.reset();
    const res = db.execute(sql);
    setResult(res);
  };

  const handleGenerateSeedData = () => {
    const targetSchema = schemaContext.trim() || sql;
    const seedSql = generateRealisticSeedData(targetSchema);
    const updatedSql = `${sql.trim()}\n\n${seedSql}`;
    setSql(updatedSql);
    db.reset();
    const res = db.execute(updatedSql);
    setResult(res);
  };

  const handleReset = () => {
    setSql(DEFAULT_SANDBOX_SCRIPT);
    db.reset();
    setResult(db.execute(DEFAULT_SANDBOX_SCRIPT));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      data-testid="live-sql-sandbox"
      className="border border-[#141414]/25 bg-[#f6f4ef] overflow-hidden flex flex-col"
    >
      {/* Header Bar */}
      <div className="p-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#141414]" />
          <div>
            <h3 className="text-[14px] font-medium text-[#141414] flex items-center gap-2">
              <span>In-Browser Live SQL Sandbox</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded">
                Embedded Relational Engine
              </span>
            </h3>
            <p className="text-[11.5px] text-[#141414]/65">
              Execute DDL, populate mock rows, and query tables with instant results — zero database setup required.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateSeedData}
            className="px-2.5 py-1.5 border border-[#141414] bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] sm:text-[10px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Automatically populate tables with realistic mock data rows"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#ff5a5f]" />
            <span>Generate Seed Data</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 border border-[#141414]/25 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] transition-colors cursor-pointer"
            title="Reset sandbox"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleRun}
            className="px-3 py-1.5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] font-mono-label text-[10px] sm:text-[10.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Query</span>
          </button>
        </div>
      </div>

      {/* Editor & Execution Output Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#141414]/15">
        {/* Left: SQL Editor */}
        <div className="flex flex-col bg-[#19191c]">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-[11px] font-mono text-[#f3f0ea]/70">
            <span>SQL Script (DDL &amp; Queries)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={10}
            className="w-full flex-1 min-h-[180px] p-3 bg-transparent text-[#f3f0ea] font-mono text-[12px] leading-[1.6] focus:outline-none resize-y nova-scroll"
            placeholder="Write CREATE TABLE, INSERT INTO, or SELECT queries..."
          />
        </div>

        {/* Right: Results Viewport */}
        <div className="flex flex-col bg-[#fbf9f5] min-h-[240px] sm:min-h-[300px]">
          {/* Result Subheader */}
          <div className="px-3 py-2 border-b border-[#141414]/10 bg-[#efece6] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[#141414]">
                <Clock className="w-3 h-3 text-[#141414]/60" />
                <span>{result.executionTimeMs}ms</span>
              </span>
              <span className="text-[#141414]/40">·</span>
              <span className="text-[#141414]">
                {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}
              </span>
              {result.error && (
                <span className="text-[#dc2626] font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Execution Error</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('table')}
                className={`px-2 py-0.5 text-[9.5px] border font-mono-label cursor-pointer ${
                  activeTab === 'table'
                    ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                    : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/20'
                }`}
              >
                <TableIcon className="w-3 h-3 inline mr-1" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chart')}
                className={`px-2 py-0.5 text-[9.5px] border font-mono-label cursor-pointer ${
                  activeTab === 'chart'
                    ? 'bg-[#141414] text-[#efece6] border-[#141414]'
                    : 'bg-[#f6f4ef] text-[#141414] border-[#141414]/20'
                }`}
              >
                <BarChart3 className="w-3 h-3 inline mr-1" />
                Chart
              </button>
            </div>
          </div>

          {/* Results Table or Chart */}
          <div className="flex-1 overflow-auto nova-scroll p-3">
            {result.error ? (
              <div className="p-4 border border-[#dc2626]/30 bg-[#fef2f2] text-[#dc2626] font-mono text-[12px] leading-relaxed">
                <span className="font-semibold block mb-1">SQL Execution Failed:</span>
                {result.error}
              </div>
            ) : activeTab === 'chart' ? (
              <DataChartGenerator
                columns={result.columns}
                rows={result.rows}
                title="Live Sandbox Chart"
              />
            ) : result.rows.length === 0 ? (
              <div className="p-8 text-center text-[12px] font-mono text-[#141414]/50">
                Query executed successfully. 0 rows returned.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#141414]/15 bg-white">
                <table className="w-full text-left border-collapse text-[11.5px] font-mono">
                  <thead>
                    <tr className="bg-[#efece6] border-b border-[#141414]/20">
                      {result.columns.map((col, idx) => (
                        <th
                          key={idx}
                          className="px-3 py-2 font-semibold text-[#141414] border-r border-[#141414]/10 last:border-r-0"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]/10">
                    {result.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#f6f4ef] transition-colors">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-1.5 border-r border-[#141414]/10 last:border-r-0 text-[#141414]/90 whitespace-nowrap"
                          >
                            {cell === null ? (
                              <span className="text-[#141414]/30 italic">NULL</span>
                            ) : typeof cell === 'boolean' ? (
                              <span className={cell ? 'text-emerald-700 font-semibold' : 'text-amber-800'}>
                                {cell ? 'TRUE' : 'FALSE'}
                              </span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
