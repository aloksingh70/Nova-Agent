import { GoogleGenAI, Type } from '@google/genai';
import type { NovaAssistantPayload, NovaMode, SqlDialect } from '../src/types/nova';

export type SupportedAiProvider = 'gemini' | 'deepseek' | 'openai' | 'anthropic';

export interface AiModelInfo {
  id: string;
  provider: SupportedAiProvider;
  name: string;
  providerName: string;
  badge: string;
  logo: string;
  status: 'active' | 'quota_needed' | 'unconfigured';
  description: string;
}

export function listSupportedModels(): AiModelInfo[] {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  return [
    {
      id: 'gemini-3.5-flash-lite',
      provider: 'gemini',
      name: 'Gemini 3.5 Flash',
      providerName: 'Google Gemini',
      badge: 'Active · Ready',
      logo: '/models/gemini.png',
      status: hasGemini ? 'active' : 'unconfigured',
      description: 'Ultra-fast multimodal SQL generation and schema reasoning (Google)',
    },
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek V3',
      providerName: 'DeepSeek',
      badge: 'Key Added · Needs Credits',
      logo: '/models/deepseek.png',
      status: hasDeepseek ? 'quota_needed' : 'unconfigured',
      description: 'High-capability code & database architecture synthesis (DeepSeek)',
    },
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      name: 'GPT-4o Mini',
      providerName: 'OpenAI',
      badge: 'Key Added · Needs Credits',
      logo: '/models/openai.png',
      status: hasOpenai ? 'quota_needed' : 'unconfigured',
      description: 'Advanced logical reasoning and query optimization (OpenAI)',
    },
    {
      id: 'claude-3-5-sonnet',
      provider: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      providerName: 'Anthropic',
      badge: 'Key Added · Needs Credits',
      logo: '/models/claude.png',
      status: hasAnthropic ? 'quota_needed' : 'unconfigured',
      description: 'Nuanced SQL DDL design and architectural analysis (Anthropic)',
    },
  ];
}

export function buildSystemInstruction(mode: NovaMode, dialect: SqlDialect, schemaContext?: string): string {
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
    'Keep responses concise, technically rigorous, and directly usable in production. You may use clean Markdown in summary, optimizationTips, debugIssues, and explanationSteps. Output strictly valid JSON matching the schema: {"summary": string, "primaryCode": string, "codeLanguage": string, "originalCode": string, "explanationSteps": string[], "optimizationTips": [{"title": string, "impact": string, "detail": string}], "indexRecommendations": string[], "debugIssues": [{"lineOrClause": string, "severity": string, "issue": string, "fix": string}], "erDiagram": {"title": string, "entities": [], "relationships": []}, "followUpSuggestions": string[]}.',
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

export interface ChatEngineInput {
  prompt: string;
  mode: NovaMode;
  dialect: SqlDialect;
  schemaContext?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  provider?: SupportedAiProvider;
  modelId?: string;
}

function parseAssistantJson(rawText: string): NovaAssistantPayload {
  const cleaned = (rawText || '').trim();
  if (!cleaned) {
    throw new Error('AI engine returned an empty response. Please try again.');
  }

  let parsed: NovaAssistantPayload;
  try {
    parsed = JSON.parse(cleaned) as NovaAssistantPayload;
  } catch {
    const unquoted = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(unquoted) as NovaAssistantPayload;
  }

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

// 1. Google Gemini Provider Implementation
async function callGemini(input: ChatEngineInput, systemInstruction: string, fullPrompt: string): Promise<NovaAssistantPayload> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const defaultModel = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const candidateModels = [defaultModel, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  let response: any = null;
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      if (response?.text) break;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      if (status === 404 || status === 503 || String(err?.message).includes('is no longer available')) {
        continue;
      }
      throw err;
    }
  }

  if (!response?.text) {
    throw lastError || new Error('Gemini returned an empty response. Please try again.');
  }

  return parseAssistantJson(response.text);
}

// 2. DeepSeek Provider Implementation
async function callDeepSeek(systemInstruction: string, fullPrompt: string): Promise<NovaAssistantPayload> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured in environment variables.');
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: `${systemInstruction}\n\nIMPORTANT: Respond with pure JSON only, without markdown backticks.` },
        { role: 'user', content: fullPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    if (res.status === 402 || data?.error?.message?.includes('Insufficient Balance')) {
      throw new Error('DeepSeek API: Insufficient Balance. Your account requires credit balance to run queries. Please top up at https://platform.deepseek.com or switch to Google Gemini (Active).');
    }
    throw new Error(data?.error?.message || `DeepSeek API error (HTTP ${res.status}).`);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  return parseAssistantJson(content);
}

// 3. OpenAI Provider Implementation
async function callOpenAI(systemInstruction: string, fullPrompt: string): Promise<NovaAssistantPayload> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured in environment variables.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${systemInstruction}\n\nIMPORTANT: Respond with pure JSON only, without markdown backticks.` },
        { role: 'user', content: fullPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    if (res.status === 429 || data?.error?.code === 'insufficient_quota' || data?.error?.message?.includes('credits')) {
      throw new Error('OpenAI API: Insufficient Quota. Your OpenAI API key has no credits remaining. Please top up at https://platform.openai.com/settings/organization/billing or switch to Google Gemini (Active).');
    }
    throw new Error(data?.error?.message || `OpenAI API error (HTTP ${res.status}).`);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  return parseAssistantJson(content);
}

// 4. Anthropic Claude Provider Implementation
async function callAnthropic(systemInstruction: string, fullPrompt: string): Promise<NovaAssistantPayload> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured in environment variables.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: `${systemInstruction}\n\nIMPORTANT: Output strictly valid JSON with no markdown wrapping or backticks.`,
      messages: [{ role: 'user', content: fullPrompt }],
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    if (res.status === 400 && data?.error?.message?.includes('balance is too low')) {
      throw new Error('Anthropic Claude API: Credit balance too low. Please add credits at https://console.anthropic.com/settings/plans or switch to Google Gemini (Active).');
    }
    throw new Error(data?.error?.message || `Anthropic API error (HTTP ${res.status}).`);
  }

  const content = data?.content?.[0]?.text || '';
  return parseAssistantJson(content);
}

export async function generateNovaResponse(input: ChatEngineInput): Promise<NovaAssistantPayload> {
  const systemInstruction = buildSystemInstruction(input.mode, input.dialect, input.schemaContext);

  const historyLines = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'NOVA'}: ${m.content}`)
    .join('\n');

  const fullPrompt = historyLines
    ? `Recent conversation context:\n${historyLines}\n\nCurrent request:\n${input.prompt}`
    : input.prompt;

  const provider = input.provider || 'gemini';

  switch (provider) {
    case 'deepseek':
      return await callDeepSeek(systemInstruction, fullPrompt);
    case 'openai':
      return await callOpenAI(systemInstruction, fullPrompt);
    case 'anthropic':
      return await callAnthropic(systemInstruction, fullPrompt);
    case 'gemini':
    default:
      return await callGemini(input, systemInstruction, fullPrompt);
  }
}
