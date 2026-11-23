export type NovaMode =
  | 'text-to-query'
  | 'er-diagram'
  | 'optimize'
  | 'debug'
  | 'schema-builder'
  | 'explain'
  | 'convert';

export type SqlDialect =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'sqlserver'
  | 'bigquery'
  | 'mongodb';

export interface ERColumn {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  references?: string;
}

export interface EREntity {
  id: string;
  name: string;
  description?: string;
  columns: ERColumn[];
}

export interface ERRelationship {
  id: string;
  fromEntity: string;
  fromColumn: string;
  toEntity: string;
  toColumn: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
  label?: string;
}

export interface ERDiagramData {
  title: string;
  summary?: string;
  entities: EREntity[];
  relationships: ERRelationship[];
}

export interface OptimizationTip {
  title: string;
  impact: 'High' | 'Medium' | 'Low';
  detail: string;
}

export interface DebugIssue {
  lineOrClause: string;
  severity: 'Error' | 'Warning' | 'Logic';
  issue: string;
  fix: string;
}

export interface NovaAssistantPayload {
  summary: string;
  primaryCode?: string;
  codeLanguage?: string;
  originalCode?: string;
  explanationSteps?: string[];
  optimizationTips?: OptimizationTip[];
  indexRecommendations?: string[];
  debugIssues?: DebugIssue[];
  erDiagram?: ERDiagramData;
  followUpSuggestions?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: NovaMode;
  dialect: SqlDialect;
  content: string;
  payload?: NovaAssistantPayload;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: NovaMode;
  dialect: SqlDialect;
  schemaContext: string;
  messages: ChatMessage[];
  updatedAt: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface ModeMeta {
  id: NovaMode;
  shortLabel: string;
  label: string;
  description: string;
  placeholder: string;
  samplePrompts: string[];
}
