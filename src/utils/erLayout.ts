import type { ERDiagramData, EREntity, ERRelationship, SqlDialect } from '../types/nova';

export interface PositionedEntity {
  entity: EREntity;
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  rowHeight: number;
}

export interface PositionedEdge {
  relationship: ERRelationship;
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  labelX: number;
  labelY: number;
  fromCardinality: string;
  toCardinality: string;
}

export interface ERLayoutResult {
  nodes: PositionedEntity[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

const NODE_WIDTH = 250;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 28;
const NODE_PADDING_BOTTOM = 12;
const H_GAP = 144;
const V_GAP = 76;
const MARGIN = 44;

/**
 * Deterministically lays out ER entities in a clean multi-column architectural grid
 * and routes smooth orthogonal/cubic connection curves between column rows.
 */
export function computeERLayout(diagram: ERDiagramData): ERLayoutResult {
  const entities = diagram.entities ?? [];
  if (entities.length === 0) {
    return { nodes: [], edges: [], width: 640, height: 320 };
  }

  // Sort hub entities (most relationships) slightly toward top-left for cleaner routing
  const degree = new Map<string, number>();
  for (const e of entities) degree.set(e.name.toLowerCase(), 0);
  for (const r of diagram.relationships ?? []) {
    const f = r.fromEntity.toLowerCase();
    const t = r.toEntity.toLowerCase();
    degree.set(f, (degree.get(f) ?? 0) + 1);
    degree.set(t, (degree.get(t) ?? 0) + 1);
  }

  const cols = entities.length <= 2 ? entities.length : entities.length <= 4 ? 2 : 3;
  const rows = Math.ceil(entities.length / cols);

  // Measure row heights so every row aligns cleanly
  const rowMaxHeights: number[] = Array.from({ length: rows }, () => 0);
  const heights = entities.map((e) => {
    const count = Math.max(e.columns?.length ?? 0, 1);
    return HEADER_HEIGHT + count * ROW_HEIGHT + NODE_PADDING_BOTTOM;
  });

  entities.forEach((_, idx) => {
    const r = Math.floor(idx / cols);
    rowMaxHeights[r] = Math.max(rowMaxHeights[r], heights[idx]);
  });

  const rowY: number[] = [];
  let accY = MARGIN;
  for (let r = 0; r < rows; r++) {
    rowY.push(accY);
    accY += rowMaxHeights[r] + V_GAP;
  }

  const nodes: PositionedEntity[] = entities.map((entity, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    return {
      entity,
      x: MARGIN + c * (NODE_WIDTH + H_GAP),
      y: rowY[r],
      width: NODE_WIDTH,
      height: heights[idx],
      headerHeight: HEADER_HEIGHT,
      rowHeight: ROW_HEIGHT,
    };
  });

  const nodeByName = new Map<string, PositionedEntity>();
  for (const n of nodes) {
    nodeByName.set(n.entity.name.toLowerCase(), n);
    nodeByName.set(n.entity.id.toLowerCase(), n);
  }

  const getColumnY = (node: PositionedEntity, columnName: string): number => {
    const idx = node.entity.columns.findIndex(
      (col) => col.name.toLowerCase() === columnName.toLowerCase()
    );
    const clampedIdx = idx >= 0 ? idx : 0;
    return node.y + node.headerHeight + clampedIdx * node.rowHeight + node.rowHeight / 2;
  };

  const edges: PositionedEdge[] = [];
  for (const rel of diagram.relationships ?? []) {
    const fromNode = nodeByName.get(rel.fromEntity.toLowerCase());
    const toNode = nodeByName.get(rel.toEntity.toLowerCase());
    if (!fromNode || !toNode) continue;

    const fromY = getColumnY(fromNode, rel.fromColumn);
    const toY = getColumnY(toNode, rel.toColumn);

    const sameColumn = Math.abs(fromNode.x - toNode.x) < 10;
    let fromX: number;
    let toX: number;
    let path: string;
    let labelX: number;
    let labelY: number;

    if (fromNode === toNode) {
      // Self-referencing loop on the right side
      fromX = fromNode.x + fromNode.width;
      toX = toNode.x + toNode.width;
      const loopOut = 48;
      path = `M ${fromX} ${fromY} C ${fromX + loopOut} ${fromY - 24}, ${toX + loopOut} ${toY + 24}, ${toX} ${toY}`;
      labelX = fromX + loopOut + 6;
      labelY = (fromY + toY) / 2;
    } else if (sameColumn) {
      // Connect via right edges with an outward arc
      fromX = fromNode.x + fromNode.width;
      toX = toNode.x + toNode.width;
      const arcOut = 54;
      path = `M ${fromX} ${fromY} C ${fromX + arcOut} ${fromY}, ${toX + arcOut} ${toY}, ${toX} ${toY}`;
      labelX = fromX + arcOut * 0.78;
      labelY = (fromY + toY) / 2;
    } else if (fromNode.x < toNode.x) {
      fromX = fromNode.x + fromNode.width;
      toX = toNode.x;
      const midX = (fromX + toX) / 2;
      path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
      labelX = midX;
      labelY = (fromY + toY) / 2 - 8;
    } else {
      fromX = fromNode.x;
      toX = toNode.x + toNode.width;
      const midX = (fromX + toX) / 2;
      path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
      labelX = midX;
      labelY = (fromY + toY) / 2 - 8;
    }

    const [fromCardinality, toCardinality] = rel.cardinality.split(':') as [string, string];
    edges.push({
      relationship: rel,
      path,
      fromX,
      fromY,
      toX,
      toY,
      labelX,
      labelY,
      fromCardinality: fromCardinality ?? '1',
      toCardinality: toCardinality ?? 'N',
    });
  }

  const totalWidth = Math.max(
    MARGIN * 2 + cols * NODE_WIDTH + Math.max(cols - 1, 0) * H_GAP + 64,
    680
  );
  const totalHeight = Math.max(accY - V_GAP + MARGIN, 340);

  return {
    nodes,
    edges,
    width: totalWidth,
    height: totalHeight,
  };
}

/**
 * Exports an ERDiagramData object to standard Mermaid erDiagram syntax.
 */
export function erDiagramToMermaid(diagram: ERDiagramData): string {
  const lines: string[] = ['erDiagram'];
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');

  for (const entity of diagram.entities) {
    lines.push(`  ${sanitize(entity.name)} {`);
    for (const col of entity.columns) {
      const cleanType = col.type.replace(/\s+/g, '_').replace(/[(),]/g, '');
      const keys: string[] = [];
      if (col.isPrimaryKey) keys.push('PK');
      if (col.isForeignKey) keys.push('FK');
      if (col.isUnique && !col.isPrimaryKey) keys.push('UK');
      const keyStr = keys.length > 0 ? ` ${keys.join(',')}` : '';
      lines.push(`    ${cleanType} ${sanitize(col.name)}${keyStr}`);
    }
    lines.push('  }');
  }

  const cardMap: Record<ERRelationship['cardinality'], string> = {
    '1:1': '||--||',
    '1:N': '||--o{',
    'N:1': '}o--||',
    'N:M': '}o--o{',
  };

  for (const rel of diagram.relationships) {
    const connector = cardMap[rel.cardinality] ?? '||--o{';
    const label = (rel.label || `${rel.fromColumn}_to_${rel.toColumn}`).replace(/"/g, "'");
    lines.push(`  ${sanitize(rel.fromEntity)} ${connector} ${sanitize(rel.toEntity)} : "${label}"`);
  }

  return lines.join('\n');
}

/**
 * Exports an ERDiagramData object to clean SQL DDL statements.
 */
export function erDiagramToSQL(diagram: ERDiagramData, dialect: SqlDialect = 'postgresql'): string {
  const quote = (id: string) => {
    if (dialect === 'mysql') return `\`${id}\``;
    if (dialect === 'sqlserver') return `[${id}]`;
    return `"${id}"`;
  };

  const statements: string[] = [];
  for (const entity of diagram.entities) {
    const colLines: string[] = [];
    const pks: string[] = [];

    for (const col of entity.columns) {
      const parts = [`  ${quote(col.name)} ${col.type}`];
      if (col.isPrimaryKey) pks.push(quote(col.name));
      if (!col.isNullable && !col.isPrimaryKey) parts.push('NOT NULL');
      if (col.isUnique && !col.isPrimaryKey) parts.push('UNIQUE');
      colLines.push(parts.join(' '));
    }

    if (pks.length > 0) {
      colLines.push(`  PRIMARY KEY (${pks.join(', ')})`);
    }

    // Add foreign keys referencing other entities
    const outgoing = diagram.relationships.filter(
      (r) => r.fromEntity.toLowerCase() === entity.name.toLowerCase()
    );
    for (const rel of outgoing) {
      const isFkColumn = entity.columns.some(
        (c) => c.name.toLowerCase() === rel.fromColumn.toLowerCase() && c.isForeignKey
      );
      if (isFkColumn) {
        colLines.push(
          `  FOREIGN KEY (${quote(rel.fromColumn)}) REFERENCES ${quote(rel.toEntity)} (${quote(rel.toColumn)})`
        );
      }
    }

    statements.push(`CREATE TABLE ${quote(entity.name)} (\n${colLines.join(',\n')}\n);`);
  }

  return statements.join('\n\n');
}
