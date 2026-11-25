import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  parseExplainAnalyze,
  SAMPLE_EXPLAIN_PLANS,
  type ParsedExplainPlan,
  type PlanNode,
} from '../utils/explainPlanParser';

interface ExplainPlanExplorerProps {
  initialPlan?: string;
  onOptimizePlan?: (planSummary: string) => void;
  schemaContext?: string;
}

export const ExplainPlanExplorer: React.FC<ExplainPlanExplorerProps> = ({
  initialPlan,
  onOptimizePlan,
  schemaContext = '',
}) => {
  const [inputPlan, setInputPlan] = useState<string>(initialPlan || SAMPLE_EXPLAIN_PLANS[0].json);

  React.useEffect(() => {
    if (initialPlan) {
      setInputPlan(initialPlan);
    }
  }, [initialPlan]);
  const [selectedNode, setSelectedNode] = useState<PlanNode | null>(null);

  const parsedPlan: { data?: ParsedExplainPlan; error?: string } = useMemo(() => {
    try {
      const data = parseExplainAnalyze(inputPlan);
      return { data };
    } catch (err: any) {
      return { error: err?.message || 'Failed to parse EXPLAIN output.' };
    }
  }, [inputPlan]);

  const handleOptimizeClick = () => {
    if (!parsedPlan.data || !onOptimizePlan) return;
    const plan = parsedPlan.data;

    const bottleneckDetails = plan.bottlenecks
      .map(
        (b) =>
          `- [${b.severity.toUpperCase()}] ${b.nodeType}${b.relationName ? ` on ${b.relationName}` : ''}: ${b.issues.join(' ')}${b.recommendation ? ` (Suggestion: ${b.recommendation})` : ''}`
      )
      .join('\n');

    const prompt = [
      '### EXPLAIN ANALYZE Execution Plan Optimization Request',
      `Total Plan Execution Time: ${plan.totalTimeMs}ms (Max Cost: ${plan.maxCost})`,
      bottleneckDetails ? `Identified Bottlenecks:\n${bottleneckDetails}` : '',
      schemaContext ? `Schema Context:\n${schemaContext}` : '',
      'Please analyze this query execution plan, propose exact covering and composite B-Tree indexes (with CREATE INDEX DDL), and provide the rewritten optimized SQL query.',
    ]
      .filter(Boolean)
      .join('\n\n');

    onOptimizePlan(prompt);
  };

  return (
    <div
      data-testid="explain-plan-explorer"
      className="border border-[#141414]/25 bg-[#f6f4ef] overflow-hidden flex flex-col"
    >
      {/* Top Header */}
      <div className="p-3 border-b border-[#141414]/15 bg-[#efece6] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#141414]" />
          <div>
            <h3 className="text-[14px] font-medium text-[#141414] flex items-center gap-2">
              <span>Visual EXPLAIN ANALYZE Query Plan Explorer</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 rounded">
                Tree &amp; Bottleneck Inspector
              </span>
            </h3>
            <p className="text-[11.5px] text-[#141414]/65">
              Paste PostgreSQL or MySQL EXPLAIN (ANALYZE, FORMAT JSON) output to visualize node trees, row estimate mismatches, and sequential scan traps.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {SAMPLE_EXPLAIN_PLANS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setInputPlan(sample.json)}
                className="px-2 py-1 border border-[#141414]/20 bg-[#efece6] hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[9.5px] transition-colors cursor-pointer"
              >
                Sample {idx + 1}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!parsedPlan.data}
            onClick={handleOptimizeClick}
            className="px-3 py-1.5 bg-[#141414] text-[#efece6] hover:bg-[#2a2928] disabled:opacity-40 font-mono-label text-[10px] sm:text-[10.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#ff5a5f]" />
            <span>Optimize This Plan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content: Input vs Visual Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] divide-y lg:divide-y-0 lg:divide-x divide-[#141414]/15">
        {/* Left: Input EXPLAIN Text/JSON */}
        <div className="flex flex-col bg-[#19191c]">
          <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#f3f0ea]/70">
            <span>Paste EXPLAIN (ANALYZE, FORMAT JSON) or Text</span>
            <span className="text-[10px] text-[#f3f0ea]/40">PostgreSQL &amp; MySQL</span>
          </div>
          <textarea
            value={inputPlan}
            onChange={(e) => setInputPlan(e.target.value)}
            rows={10}
            className="w-full flex-1 min-h-[180px] p-3 bg-transparent text-[#f3f0ea] font-mono text-[11.5px] leading-[1.6] focus:outline-none resize-y nova-scroll"
            placeholder="Paste your EXPLAIN output here..."
          />
        </div>

        {/* Right: Visual Plan Tree */}
        <div className="flex flex-col bg-[#fbf9f5] min-h-[260px] sm:min-h-[350px]">
          {parsedPlan.error ? (
            <div className="p-6 text-center text-[#dc2626] font-mono text-[12px]">
              {parsedPlan.error}
            </div>
          ) : parsedPlan.data ? (
            <div className="flex-1 flex flex-col">
              {/* Summary Metrics Bar */}
              <div className="p-3 border-b border-[#141414]/10 bg-[#efece6] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[#141414]">
                    <Clock className="w-3 h-3 text-[#141414]/60" />
                    <span>{parsedPlan.data.totalTimeMs}ms total time</span>
                  </span>
                  <span className="text-[#141414]/40">·</span>
                  <span className="text-[#141414]">
                    Cost: {parsedPlan.data.maxCost}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {parsedPlan.data.summary.criticalCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-800 border border-red-300 font-semibold text-[9.5px]">
                      {parsedPlan.data.summary.criticalCount} Critical Bottleneck
                    </span>
                  )}
                  {parsedPlan.data.summary.warningCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[9.5px]">
                      {parsedPlan.data.summary.warningCount} Warning
                    </span>
                  )}
                  {parsedPlan.data.bottlenecks.length === 0 && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-[9.5px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Optimal Plan
                    </span>
                  )}
                </div>
              </div>

              {/* Interactive Node Tree */}
              <div className="flex-1 p-3 overflow-y-auto nova-scroll space-y-2">
                <PlanTreeNode
                  node={parsedPlan.data.root}
                  maxCost={parsedPlan.data.maxCost}
                  selectedId={selectedNode?.id}
                  onSelect={(n) => setSelectedNode(n)}
                />
              </div>

              {/* Selected Node Details Drawer */}
              {selectedNode && (
                <div className="p-3 border-t border-[#141414]/15 bg-[#efece6] text-[11px] font-mono space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#141414]">
                      {selectedNode.nodeType} {selectedNode.relationName ? `on ${selectedNode.relationName}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(null)}
                      className="text-[#141414]/60 hover:text-[#141414] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  {selectedNode.issues.length > 0 && (
                    <div className="space-y-1 text-red-700">
                      {selectedNode.issues.map((iss, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-red-600" />
                          <span>{iss}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedNode.recommendation && (
                    <div className="p-2 border border-emerald-500/30 bg-emerald-50 text-emerald-900 rounded-xs">
                      <span className="font-semibold block mb-0.5">AI Index &amp; Optimization Tip:</span>
                      {selectedNode.recommendation}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

interface PlanTreeNodeProps {
  node: PlanNode;
  maxCost: number;
  selectedId?: string;
  onSelect: (node: PlanNode) => void;
  depth?: number;
}

const PlanTreeNode: React.FC<PlanTreeNodeProps> = ({
  node,
  maxCost,
  selectedId,
  onSelect,
  depth = 0,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const isSelected = selectedId === node.id;

  const costPct = Math.max(3, Math.min(100, Math.round((node.totalCost / maxCost) * 100)));

  return (
    <div className="space-y-1" style={{ marginLeft: `${Math.min(depth * 12, 48)}px` }}>
      <div
        onClick={() => onSelect(node)}
        className={`p-2.5 border transition-all cursor-pointer flex flex-col gap-1.5 ${
          isSelected
            ? 'border-[#141414] bg-[#efece6] shadow-xs'
            : node.severity === 'critical'
              ? 'border-red-400 bg-red-50/60 hover:border-red-600'
              : node.severity === 'warning'
                ? 'border-amber-400 bg-amber-50/60 hover:border-amber-600'
                : 'border-[#141414]/15 bg-white hover:border-[#141414]/35'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold text-[#141414] truncate">
            {node.children.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed(!collapsed);
                }}
                className="p-0.5 hover:bg-[#141414]/10 rounded cursor-pointer"
              >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            <span
              className={
                node.severity === 'critical'
                  ? 'text-red-700'
                  : node.severity === 'warning'
                    ? 'text-amber-800'
                    : 'text-[#141414]'
              }
            >
              {node.nodeType}
            </span>
            {node.relationName && (
              <span className="text-[#141414]/60 font-normal">on {node.relationName}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {node.actualTotalTimeMs != null && (
              <span className="font-mono text-[10px] text-[#141414]/75 tabular-nums">
                {node.actualTotalTimeMs}ms
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 text-[9px] font-mono border uppercase font-medium ${
                node.severity === 'critical'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : node.severity === 'warning'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}
            >
              {node.severity}
            </span>
          </div>
        </div>

        {/* Cost Bar */}
        <div className="w-full bg-[#141414]/10 h-1.5 rounded-xs overflow-hidden">
          <div
            style={{ width: `${costPct}%` }}
            className={`h-full ${
              node.severity === 'critical'
                ? 'bg-red-600'
                : node.severity === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-[#141414]'
            }`}
          />
        </div>

        {/* Row count summary */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[#141414]/65">
          <span>
            Rows: {node.actualRows != null ? `${node.actualRows.toLocaleString()} actual` : `${node.planRows.toLocaleString()} est`}
          </span>
          <span>Cost: {node.totalCost}</span>
        </div>

        {/* Highlighted Bottleneck Notice */}
        {node.issues.length > 0 && (
          <div className="mt-0.5 text-[10.5px] font-mono text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0 text-red-600" />
            <span className="truncate">{node.issues[0]}</span>
          </div>
        )}
      </div>

      {/* Children Nodes */}
      {!collapsed && node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <PlanTreeNode
              key={child.id}
              node={child}
              maxCost={maxCost}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
