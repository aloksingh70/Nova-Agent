import { GoogleGenAI, Type } from '@google/genai';
import type { NovaAssistantPayload, NovaMode, SqlDialect } from '../src/types/nova';

const DEFAULT_MODEL = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
const FALLBACK_MODES = [DEFAULT_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(
  (v, i, a) => a.indexOf(v) === i
);

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets to attach a Gemini API key.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(mode: NovaMode, dialect: SqlDialect, schemaContext?: string): string {
  const dialectLabel = dialect.toUpperCase();
  const modeGuidance: Record<NovaMode, string> = {
    'text-to-query': `Convert the user's plain-language request into an idiomatic, production-ready ${dialectLabel} query. Populate primaryCode with the formatted query, codeLanguage with "${dialect === 'mongodb' ? 'javascript' : 'sql'}", summary with a concise architectural explanation, and explanationSteps with clear clause-by-clause notes.`,
    'er-diagram': `Design a clean, normalized Entity-Relationship (ER) diagram for the user's domain. You MUST populate erDiagram with 3 to 7 well-structured entities (each with columns marking isPrimaryKey, isForeignKey, isUnique, isNullable, and SQL types) and accurate relationships with cardinality ("1:1", "1:N", "N:1", or "N:M") connecting valid entity names and column names. Also populate primaryCode with the corresponding ${dialectLabel} CREATE TABLE DDL.`,
    optimize: `Analyze the user's query for performance bottlenecks (full table scans, non-SARGable predicates, N+1 subqueries, unnecessary DISTINCT/SELECT *, missing indexes). Populate primaryCode with the rewritten optimized ${dialectLabel} query, originalCode with the user's input query, optimizationTips with 2 to 4 concrete improvements (impact: "High", "Medium", or "Low"), and indexRecommendations with executable CREATE INDEX statements.`,
    debug: `Diagnose all syntax, semantic, aggregation, NULL-handling, and join bugs in the user's query. Populate debugIssues with each bug (lineOrClause, severity: "Error" | "Warning" | "Logic", issue, fix), originalCode with the broken query, and primaryCode with the corrected ${dialectLabel} query.`,
    'schema-builder': `Create a normalized 3NF ${dialectLabel} database schema with CREATE TABLE DDL, primary/foreign keys, check constraints, indexes, and sample seed inserts in primaryCode. If helpful, also populate erDiagram so the user can inspect the schema visually.`,
    explain: `Explain the user's query thoroughly from execution order (FROM/JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> WINDOW -> ORDER BY -> LIMIT). Populate summary, explanationSteps (ordered execution steps), and primaryCode with a cleanly formatted annotated version of the query.`,
    convert: `Convert the user's query into idiomatic ${dialectLabel}. Preserve exact semantics, handle dialect-specific date/string/null/aggregation functions accurately, populate originalCode with the input query, primaryCode with the converted query, and explanationSteps noting key dialect differences.`,
  };

  const schemaSection = schemaContext?.trim()
    ? `\n\nActive User Schema Context (ground table and column names in this schema whenever relevant):\n${schemaContext.trim()}`
    : '';

  return [
    'You are NOVA AGENT, a senior database architect and SQL/NoSQL query intelligence engine.',
    `Target database dialect: ${dialectLabel}.`,
    modeGuidance[mode],
    'Keep responses concise, technically rigorous, and directly usable in production. You may use clean Markdown in summary, optimizationTips, debugIssues, and explanationSteps (such as inline `table.column` code, bullet lists, and compact Markdown comparison tables when comparing schemas, indexes, or query clauses). Always include 2 short followUpSuggestions relevant to the next engineering step.',
    schemaSection,
  ].join('\n');
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'Concise 1-3 sentence executive summary of the solution.',
    },
    primaryCode: {
      type: Type.STRING,
      description: 'Formatted SQL, DDL, or MongoDB query output.',
    },
    codeLanguage: {
      type: Type.STRING,
      description: 'Code language identifier, e.g. sql or javascript.',
    },
    originalCode: {
      type: Type.STRING,
      description: 'Original user query when optimizing, debugging, or converting.',
    },
    explanationSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Ordered technical walkthrough steps.',
    },
    optimizationTips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          impact: { type: Type.STRING, description: 'High, Medium, or Low' },
          detail: { type: Type.STRING },
        },
        required: ['title', 'impact', 'detail'],
      },
    },
    indexRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Executable CREATE INDEX DDL statements.',
    },
    debugIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          lineOrClause: { type: Type.STRING },
          severity: { type: Type.STRING, description: 'Error, Warning, or Logic' },
          issue: { type: Type.STRING },
          fix: { type: Type.STRING },
        },
        required: ['lineOrClause', 'severity', 'issue', 'fix'],
      },
    },
    erDiagram: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              columns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
                    isPrimaryKey: { type: Type.BOOLEAN },
                    isForeignKey: { type: Type.BOOLEAN },
                    isNullable: { type: Type.BOOLEAN },
                    isUnique: { type: Type.BOOLEAN },
                    references: { type: Type.STRING },
                  },
                  required: ['name', 'type'],
                },
              },
            },
            required: ['id', 'name', 'columns'],
          },
        },
        relationships: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              fromEntity: { type: Type.STRING },
              fromColumn: { type: Type.STRING },
              toEntity: { type: Type.STRING },
              toColumn: { type: Type.STRING },
              cardinality: { type: Type.STRING, description: 'One of 1:1, 1:N, N:1, N:M' },
              label: { type: Type.STRING },
            },
            required: ['id', 'fromEntity', 'fromColumn', 'toEntity', 'toColumn', 'cardinality'],
          },
        },
      },
      required: ['title', 'entities', 'relationships'],
    },
    followUpSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['summary'],
};

export interface GeminiChatInput {
  prompt: string;
  mode: NovaMode;
  dialect: SqlDialect;
  schemaContext?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export async function generateNovaResponse(input: GeminiChatInput): Promise<NovaAssistantPayload> {
  const ai = getGeminiClient();

  const historyLines = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'NOVA'}: ${m.content}`)
    .join('\n');

  const fullPrompt = historyLines
    ? `Recent conversation context:\n${historyLines}\n\nCurrent request:\n${input.prompt}`
    : input.prompt;

  let response: any = null;
  let lastError: unknown = null;

  for (const model of FALLBACK_MODES) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction: buildSystemInstruction(input.mode, input.dialect, input.schemaContext),
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      if (response?.text) {
        break;
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      // If model not found (404) or temporarily overloaded (503), try next fallback model
      if (status === 404 || status === 503 || String(err?.message).includes('is no longer available')) {
        continue;
      }
      throw err;
    }
  }

  if (!response?.text) {
    throw lastError || new Error('Gemini returned an empty response. Please try again.');
  }

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  let parsed: NovaAssistantPayload;
  try {
    parsed = JSON.parse(rawText) as NovaAssistantPayload;
  } catch {
    // Strip markdown fences if any slipped in
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned) as NovaAssistantPayload;
  }

  // Normalize impact/severity/cardinality values defensively
  if (parsed.erDiagram?.relationships) {
    const validCards = new Set(['1:1', '1:N', 'N:1', 'N:M']);
    parsed.erDiagram.relationships = parsed.erDiagram.relationships.map((r, i) => ({
      ...r,
      id: r.id || `rel_${i + 1}`,
      cardinality: validCards.has(r.cardinality) ? r.cardinality : '1:N',
    }));
  }

  return parsed;
}
