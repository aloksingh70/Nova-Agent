export type PlanSeverity = 'critical' | 'warning' | 'optimal';

export interface PlanNode {
  id: string;
  nodeType: string;
  relationName?: string;
  alias?: string;
  totalCost: number;
  actualTotalTimeMs?: number;
  planRows: number;
  actualRows?: number;
  loops: number;
  filter?: string;
  indexName?: string;
  indexCond?: string;
  hashCond?: string;
  sortKey?: string[];
  severity: PlanSeverity;
  issues: string[];
  recommendation?: string;
  timePercent?: number;
  children: PlanNode[];
}

export interface ParsedExplainPlan {
  root: PlanNode;
  totalTimeMs: number;
  maxCost: number;
  bottlenecks: PlanNode[];
  summary: {
    criticalCount: number;
    warningCount: number;
    hasSeqScan: boolean;
    hasHighCostSort: boolean;
    hasRowMismatch: boolean;
  };
}

export function parseExplainAnalyze(input: string): ParsedExplainPlan {
  const clean = input.trim();
  if (!clean) {
    throw new Error('Please paste valid PostgreSQL or MySQL EXPLAIN output.');
  }

  // 1. Try JSON format first
  if (clean.startsWith('[') || clean.startsWith('{')) {
    try {
      const json = JSON.parse(clean);
      const rootObj = Array.isArray(json) ? json[0]?.Plan : json.Plan ?? json;
      if (rootObj && typeof rootObj === 'object') {
        return parseJsonPlanTree(rootObj);
      }
    } catch {
      // Fallback to text parsing
    }
  }

  // 2. Parse Text / Tabular EXPLAIN output
  return parseTextPlanTree(clean);
}

function parseJsonPlanTree(rawNode: any): ParsedExplainPlan {
  let counter = 0;
  const allNodes: PlanNode[] = [];

  function walk(node: any): PlanNode {
    counter++;
    const id = `node_${counter}`;
    const nodeType = node['Node Type'] || node.nodeType || 'Operation';
    const relationName = node['Relation Name'] || node.relationName;
    const totalCost = Number(node['Total Cost'] || node.totalCost || 0);
    const actualTotalTime = node['Actual Total Time'] ?? node.actualTotalTime;
    const actualTotalTimeMs = actualTotalTime != null ? Number(actualTotalTime) : undefined;
    const planRows = Number(node['Plan Rows'] || node.planRows || 1);
    const actualRows = node['Actual Rows'] != null ? Number(node['Actual Rows']) : undefined;
    const loops = Number(node['Actual Loops'] || node.loops || 1);
    const filter = node['Filter'] || node.filter;
    const indexName = node['Index Name'] || node.indexName;
    const indexCond = node['Index Cond'] || node.indexCond;
    const hashCond = node['Hash Cond'] || node.hashCond;

    const issues: string[] = [];
    let severity: PlanSeverity = 'optimal';
    let recommendation: string | undefined = undefined;

    // Diagnose bottlenecks
    const isSeqScan = /Seq Scan/i.test(nodeType);
    const isSort = /Sort/i.test(nodeType);
    const isNestedLoop = /Nested Loop/i.test(nodeType);

    if (isSeqScan && (actualRows || planRows) > 1000) {
      severity = 'critical';
      issues.push(`Sequential Scan across ${(actualRows || planRows).toLocaleString()} rows.`);
      recommendation = relationName
        ? `Create an index on ${relationName}${filter ? ` covering filtered predicate (${filter})` : ''} to convert this to an Index Scan.`
        : 'Add an index on the filtered column to eliminate sequential scan.';
    } else if (isSort && totalCost > 1000) {
      severity = 'warning';
      issues.push(`High cost in-memory sort (cost: ${totalCost}).`);
      recommendation = 'Add a composite B-Tree index covering the ORDER BY columns to avoid sorting.';
    } else if (isNestedLoop && (actualRows || planRows) > 5000) {
      severity = 'warning';
      issues.push(`Nested loop join over ${(actualRows || planRows).toLocaleString()} rows may scale poorly (N×M cost).`);
      recommendation = 'Ensure joining foreign key column is indexed to allow Hash Join or fast index lookups.';
    }

    // Row estimation mismatch (e.g. planner estimated 10 rows but actually got 100,000)
    if (actualRows != null && planRows > 0) {
      const ratio = actualRows > planRows ? actualRows / planRows : planRows / actualRows;
      if (ratio > 10 && actualRows > 500) {
        issues.push(`Row count estimate mismatch: estimated ${planRows.toLocaleString()}, actual was ${actualRows.toLocaleString()} (${Math.round(ratio)}x error).`);
        recommendation = (recommendation ? `${recommendation} ` : '') + 'Run ANALYZE on table to refresh planner statistics.';
        if (severity === 'optimal') severity = 'warning';
      }
    }

    const rawPlans = node['Plans'] || node.children || [];
    const children: PlanNode[] = Array.isArray(rawPlans) ? rawPlans.map(walk) : [];

    const planNode: PlanNode = {
      id,
      nodeType,
      relationName,
      totalCost,
      actualTotalTimeMs,
      planRows,
      actualRows,
      loops,
      filter,
      indexName,
      indexCond,
      hashCond,
      severity,
      issues,
      recommendation,
      children,
    };

    allNodes.push(planNode);
    return planNode;
  }

  const root = walk(rawNode);
  const totalTimeMs = root.actualTotalTimeMs || 100;

  // Calculate percentage time of each node
  for (const n of allNodes) {
    if (n.actualTotalTimeMs) {
      n.timePercent = Math.min(100, Math.round((n.actualTotalTimeMs / totalTimeMs) * 100));
    }
  }

  const bottlenecks = allNodes.filter((n) => n.severity === 'critical' || n.severity === 'warning');
  const maxCost = Math.max(...allNodes.map((n) => n.totalCost), 1);

  return {
    root,
    totalTimeMs,
    maxCost,
    bottlenecks,
    summary: {
      criticalCount: allNodes.filter((n) => n.severity === 'critical').length,
      warningCount: allNodes.filter((n) => n.severity === 'warning').length,
      hasSeqScan: allNodes.some((n) => /Seq Scan/i.test(n.nodeType)),
      hasHighCostSort: allNodes.some((n) => /Sort/i.test(n.nodeType) && n.totalCost > 1000),
      hasRowMismatch: allNodes.some((n) => n.issues.some((i) => i.includes('estimate mismatch'))),
    },
  };
}

function parseTextPlanTree(text: string): ParsedExplainPlan {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  let counter = 0;
  const nodes: PlanNode[] = [];

  for (const line of lines) {
    counter++;
    const nodeTypeMatch =
      line.match(/(?:->|\s+)?([A-Za-z\s]+?)\s+on\s+([A-Za-z0-9_]+)/i) ||
      line.match(/(?:->|\s+)?([A-Za-z\s]+?)(?=\s*\(|$)/);
    const costMatch = line.match(/cost=([\d.]+)\.\.([\d.]+)/);
    const rowsMatch = line.match(/rows=(\d+)/);
    const timeMatch = line.match(/time=([\d.]+)\.\.([\d.]+)/);
    const actualRowsMatch = line.match(/actual rows=(\d+)/i) || line.match(/rows=(\d+)\s+loops/i);

    const nodeType = nodeTypeMatch ? nodeTypeMatch[1].trim() : 'Operation';
    const relationName = nodeTypeMatch ? nodeTypeMatch[2] : undefined;
    const totalCost = costMatch ? parseFloat(costMatch[2]) : 100;
    const actualTotalTimeMs = timeMatch ? parseFloat(timeMatch[2]) : undefined;
    const planRows = rowsMatch ? parseInt(rowsMatch[1], 10) : 100;
    const actualRows = actualRowsMatch ? parseInt(actualRowsMatch[1], 10) : undefined;

    const isSeqScan = /Seq Scan/i.test(nodeType);
    const isSort = /Sort/i.test(nodeType);

    const issues: string[] = [];
    let severity: PlanSeverity = 'optimal';
    let recommendation: string | undefined = undefined;

    if (isSeqScan && (actualRows || planRows) > 1000) {
      severity = 'critical';
      issues.push(`Sequential Scan across ${(actualRows || planRows).toLocaleString()} rows.`);
      recommendation = relationName ? `Add index on ${relationName} to convert to Index Scan.` : undefined;
    } else if (isSort && totalCost > 1000) {
      severity = 'warning';
      issues.push(`High cost sort operation.`);
      recommendation = 'Create composite index covering ORDER BY.';
    }

    nodes.push({
      id: `text_node_${counter}`,
      nodeType,
      relationName,
      totalCost,
      actualTotalTimeMs,
      planRows,
      actualRows,
      loops: 1,
      severity,
      issues,
      recommendation,
      children: [],
    });
  }

  // Nest into single root if multiple lines
  const root = nodes[0] || {
    id: 'root',
    nodeType: 'Query Plan',
    totalCost: 100,
    planRows: 1,
    loops: 1,
    severity: 'optimal' as PlanSeverity,
    issues: [],
    children: [],
  };

  if (nodes.length > 1) {
    root.children = nodes.slice(1);
  }

  const bottlenecks = nodes.filter((n) => n.severity === 'critical' || n.severity === 'warning');

  return {
    root,
    totalTimeMs: root.actualTotalTimeMs || 100,
    maxCost: Math.max(...nodes.map((n) => n.totalCost), 1),
    bottlenecks,
    summary: {
      criticalCount: bottlenecks.filter((b) => b.severity === 'critical').length,
      warningCount: bottlenecks.filter((b) => b.severity === 'warning').length,
      hasSeqScan: nodes.some((n) => /Seq Scan/i.test(n.nodeType)),
      hasHighCostSort: nodes.some((n) => /Sort/i.test(n.nodeType) && n.totalCost > 1000),
      hasRowMismatch: false,
    },
  };
}

export const SAMPLE_EXPLAIN_PLANS = [
  {
    title: 'Slow Sequential Scan on Orders (120k rows)',
    json: JSON.stringify(
      [
        {
          Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': 'orders',
            'Alias': 'o',
            'Startup Cost': 0.0,
            'Total Cost': 4850.0,
            'Plan Rows': 120000,
            'Plan Width': 64,
            'Actual Startup Time': 0.08,
            'Actual Total Time': 285.4,
            'Actual Rows': 118400,
            'Actual Loops': 1,
            'Filter': "((status)::text = 'completed'::text)",
            'Rows Removed by Filter': 24000,
          },
        },
      ],
      null,
      2
    ),
  },
  {
    title: 'Nested Loop Join with High-Cost Sort',
    json: JSON.stringify(
      [
        {
          Plan: {
            'Node Type': 'Sort',
            'Startup Cost': 3200.0,
            'Total Cost': 3450.0,
            'Plan Rows': 10000,
            'Actual Startup Time': 120.5,
            'Actual Total Time': 145.2,
            'Actual Rows': 9800,
            'Actual Loops': 1,
            'Sort Key': ['o.created_at DESC'],
            'Plans': [
              {
                'Node Type': 'Nested Loop',
                'Startup Cost': 0.42,
                'Total Cost': 2100.0,
                'Plan Rows': 10000,
                'Actual Startup Time': 0.15,
                'Actual Total Time': 98.4,
                'Actual Rows': 9800,
                'Actual Loops': 1,
                'Plans': [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'customers',
                    'Alias': 'c',
                    'Startup Cost': 0.0,
                    'Total Cost': 450.0,
                    'Plan Rows': 5000,
                    'Actual Startup Time': 0.04,
                    'Actual Total Time': 18.2,
                    'Actual Rows': 4900,
                    'Actual Loops': 1,
                  },
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'orders',
                    'Index Name': 'idx_orders_customer_id',
                    'Startup Cost': 0.42,
                    'Total Cost': 1650.0,
                    'Plan Rows': 2,
                    'Actual Startup Time': 0.01,
                    'Actual Total Time': 0.016,
                    'Actual Rows': 2,
                    'Actual Loops': 4900,
                  },
                ],
              },
            ],
          },
        },
      ],
      null,
      2
    ),
  },
];
