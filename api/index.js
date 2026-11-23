// server/createApp.ts
import dotenv from "dotenv";
import crypto3 from "node:crypto";
import path2 from "node:path";
import express from "express";

// server/authStore.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateRegistrationInput(input) {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  if (name.length < 2) {
    return { valid: false, error: "Full name must be at least 2 characters." };
  }
  if (!EMAIL_RE.test(email)) {
    return { valid: false, error: "Enter a valid email address." };
  }
  if (password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters." };
  }
  return { valid: true };
}
function validateLoginInput(input) {
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  if (!EMAIL_RE.test(email)) {
    return { valid: false, error: "Enter a valid email address." };
  }
  if (password.length < 1) {
    return { valid: false, error: "Enter your password." };
  }
  return { valid: true };
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
function signSessionToken(userId, secret, ttlMs = 7 * 24 * 60 * 60 * 1e3) {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySessionToken(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}
function parseCookieHeader(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}
var NovaStore = class {
  constructor(filePath = process.env.VERCEL ? path.resolve("/tmp", "nova_store.json") : path.resolve(process.cwd(), "data/nova_store.json")) {
    this.filePath = filePath;
    this.data = this.load();
    this.purgeLegacyDemoAccount();
  }
  load() {
    if (!this.filePath) {
      return { users: [], sessionsByUser: {} };
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users) && typeof parsed.sessionsByUser === "object") {
          return parsed;
        }
      }
    } catch {
    }
    return { users: [], sessionsByUser: {} };
  }
  persist() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn("NovaStore persist warning (falling back to in-memory store):", err);
    }
  }
  purgeLegacyDemoAccount() {
    const beforeCount = this.data.users.length;
    this.data.users = this.data.users.filter(
      (u) => u.email !== "demo@novaagent.io" && u.id !== "user-demo-nova"
    );
    if (this.data.sessionsByUser["user-demo-nova"]) {
      delete this.data.sessionsByUser["user-demo-nova"];
    }
    if (this.data.users.length !== beforeCount) {
      this.persist();
    }
  }
  upsertOAuthUser(input) {
    const email = input.email.trim().toLowerCase();
    const existing = this.data.users.find((u) => u.email === email);
    if (existing) {
      if (!existing.name && input.name.trim()) {
        existing.name = input.name.trim();
        this.persist();
      }
      return this.toPublicUser(existing);
    }
    const user = {
      id: `usr_${crypto.randomUUID().slice(0, 10)}`,
      name: input.name.trim() || email.split("@")[0],
      email,
      role: `${input.provider.charAt(0).toUpperCase()}${input.provider.slice(1)} Account`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      passwordHash: hashPassword(crypto.randomBytes(24).toString("hex"))
    };
    this.data.users.push(user);
    this.data.sessionsByUser[user.id] = [];
    this.persist();
    return this.toPublicUser(user);
  }
  toPublicUser(u) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt
    };
  }
  registerUser(input) {
    const check = validateRegistrationInput(input);
    if (!check.valid) return { error: check.error };
    const email = input.email.trim().toLowerCase();
    if (this.data.users.some((u) => u.email === email)) {
      return { error: "An account with this email already exists." };
    }
    const user = {
      id: `usr_${crypto.randomUUID().slice(0, 10)}`,
      name: input.name.trim(),
      email,
      role: "Data Engineer",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      passwordHash: hashPassword(input.password)
    };
    this.data.users.push(user);
    this.data.sessionsByUser[user.id] = [];
    this.persist();
    return { user: this.toPublicUser(user) };
  }
  authenticateUser(input) {
    const check = validateLoginInput(input);
    if (!check.valid) return { error: check.error };
    const email = input.email.trim().toLowerCase();
    const found = this.data.users.find((u) => u.email === email);
    if (!found || !verifyPassword(input.password, found.passwordHash)) {
      return { error: "Invalid email or password." };
    }
    return { user: this.toPublicUser(found) };
  }
  getUserById(userId) {
    const found = this.data.users.find((u) => u.id === userId);
    return found ? this.toPublicUser(found) : null;
  }
  listSessions(userId) {
    const list = this.data.sessionsByUser[userId] ?? [];
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  createSession(userId, opts) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = {
      id: `ses_${crypto.randomUUID().slice(0, 10)}`,
      title: (opts.title ?? "Untitled Query").trim() || "Untitled Query",
      mode: opts.mode,
      dialect: opts.dialect,
      schemaContext: opts.schemaContext ?? "",
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    if (!this.data.sessionsByUser[userId]) {
      this.data.sessionsByUser[userId] = [];
    }
    this.data.sessionsByUser[userId].unshift(session);
    this.persist();
    return session;
  }
  appendMessages(userId, sessionId, newMessages, updates) {
    const list = this.data.sessionsByUser[userId] ?? [];
    const session = list.find((s) => s.id === sessionId);
    if (!session) return null;
    session.messages.push(...newMessages);
    if (updates?.title) session.title = updates.title;
    if (updates?.mode) session.mode = updates.mode;
    if (updates?.dialect) session.dialect = updates.dialect;
    if (updates?.schemaContext !== void 0) session.schemaContext = updates.schemaContext;
    session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return session;
  }
  deleteSession(userId, sessionId) {
    const list = this.data.sessionsByUser[userId] ?? [];
    const idx = list.findIndex((s) => s.id === sessionId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.persist();
    return true;
  }
  renameSession(userId, sessionId, newTitle) {
    const clean = newTitle.trim();
    if (!clean) return null;
    const list = this.data.sessionsByUser[userId] ?? [];
    const session = list.find((s) => s.id === sessionId);
    if (!session) return null;
    session.title = clean.slice(0, 80);
    session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return session;
  }
  changePassword(userId, currentPassword, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: "New password must be at least 6 characters." };
    }
    const found = this.data.users.find((u) => u.id === userId);
    if (!found) {
      return { ok: false, error: "Account not found." };
    }
    if (!verifyPassword(currentPassword, found.passwordHash)) {
      return { ok: false, error: "Current password is incorrect." };
    }
    found.passwordHash = hashPassword(newPassword);
    this.persist();
    return { ok: true };
  }
};

// server/oauthProviders.ts
import crypto2 from "node:crypto";
var OAUTH_PROVIDERS = ["google"];
function isOAuthProvider(value) {
  return value === "google";
}
function resolveAppOrigin(envAppUrl, reqProto, reqHost) {
  const fromEnv = (envAppUrl || "").trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  const proto = (reqProto || "http").split(",")[0].trim() || "http";
  const host = (reqHost || "localhost:3000").trim();
  return `${proto}://${host}`.replace(/\/+$/, "");
}
function getOAuthProviderConfig(_provider, env, appOrigin) {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  return {
    id: "google",
    name: "Google",
    clientId: (env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (env.GOOGLE_CLIENT_SECRET || "").trim(),
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    redirectUri: `${cleanOrigin}/auth/callback/google`
  };
}
function listOAuthProviderStatuses(env, appOrigin) {
  return OAUTH_PROVIDERS.map((id) => {
    const cfg = getOAuthProviderConfig(id, env, appOrigin);
    return {
      id: cfg.id,
      name: cfg.name,
      configured: Boolean(cfg.clientId && cfg.clientSecret),
      callbackUrl: cfg.redirectUri,
      envVars: cfg.envVars
    };
  });
}
function signOAuthState(provider, secret, ttlMs = 10 * 60 * 1e3) {
  const payload = Buffer.from(
    JSON.stringify({
      p: provider,
      n: crypto2.randomBytes(12).toString("hex"),
      exp: Date.now() + ttlMs
    })
  ).toString("base64url");
  const sig = crypto2.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyOAuthState(state, expectedProvider, secret) {
  if (!state || !state.includes(".")) return false;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  const expectedSig = crypto2.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto2.timingSafeEqual(a, b)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decoded.p !== expectedProvider) return false;
    if (!decoded.exp || Date.now() > decoded.exp) return false;
    return true;
  } catch {
    return false;
  }
}
function buildOAuthAuthorizationUrl(cfg, state) {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    access_type: "online",
    prompt: "select_account"
  });
  return `${cfg.authUrl}?${params.toString()}`;
}
function buildSessionCookieHeader(cookieName, token, opts) {
  const attrs = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${opts.maxAgeSeconds}`,
    opts.secure ? "SameSite=None; Secure" : "SameSite=Lax"
  ];
  return attrs.join("; ");
}

// server/geminiService.ts
import { GoogleGenAI, Type } from "@google/genai";
var DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
var FALLBACK_MODES = [DEFAULT_MODEL, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"].filter(
  (v, i, a) => a.indexOf(v) === i
);
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured. Open Settings > Secrets to attach a Gemini API key."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function buildSystemInstruction(mode, dialect, schemaContext) {
  const dialectLabel = dialect.toUpperCase();
  const modeGuidance = {
    "text-to-query": `Convert the user's plain-language request into an idiomatic, production-ready ${dialectLabel} query. Populate primaryCode with the formatted query, codeLanguage with "${dialect === "mongodb" ? "javascript" : "sql"}", summary with a concise architectural explanation, and explanationSteps with clear clause-by-clause notes.`,
    "er-diagram": `Design a clean, normalized Entity-Relationship (ER) diagram for the user's domain. You MUST populate erDiagram with 3 to 7 well-structured entities (each with columns marking isPrimaryKey, isForeignKey, isUnique, isNullable, and SQL types) and accurate relationships with cardinality ("1:1", "1:N", "N:1", or "N:M") connecting valid entity names and column names. Also populate primaryCode with the corresponding ${dialectLabel} CREATE TABLE DDL.`,
    optimize: `Analyze the user's query for performance bottlenecks (full table scans, non-SARGable predicates, N+1 subqueries, unnecessary DISTINCT/SELECT *, missing indexes). Populate primaryCode with the rewritten optimized ${dialectLabel} query, originalCode with the user's input query, optimizationTips with 2 to 4 concrete improvements (impact: "High", "Medium", or "Low"), and indexRecommendations with executable CREATE INDEX statements.`,
    debug: `Diagnose all syntax, semantic, aggregation, NULL-handling, and join bugs in the user's query. Populate debugIssues with each bug (lineOrClause, severity: "Error" | "Warning" | "Logic", issue, fix), originalCode with the broken query, and primaryCode with the corrected ${dialectLabel} query.`,
    "schema-builder": `Create a normalized 3NF ${dialectLabel} database schema with CREATE TABLE DDL, primary/foreign keys, check constraints, indexes, and sample seed inserts in primaryCode. If helpful, also populate erDiagram so the user can inspect the schema visually.`,
    explain: `Explain the user's query thoroughly from execution order (FROM/JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> WINDOW -> ORDER BY -> LIMIT). Populate summary, explanationSteps (ordered execution steps), and primaryCode with a cleanly formatted annotated version of the query.`,
    convert: `Convert the user's query into idiomatic ${dialectLabel}. Preserve exact semantics, handle dialect-specific date/string/null/aggregation functions accurately, populate originalCode with the input query, primaryCode with the converted query, and explanationSteps noting key dialect differences.`
  };
  const schemaSection = schemaContext?.trim() ? `

Active User Schema Context (ground table and column names in this schema whenever relevant):
${schemaContext.trim()}` : "";
  return [
    "You are NOVA AGENT, a senior database architect and SQL/NoSQL query intelligence engine.",
    `Target database dialect: ${dialectLabel}.`,
    modeGuidance[mode],
    "Keep responses concise, technically rigorous, and directly usable in production. You may use clean Markdown in summary, optimizationTips, debugIssues, and explanationSteps (such as inline `table.column` code, bullet lists, and compact Markdown comparison tables when comparing schemas, indexes, or query clauses). Always include 2 short followUpSuggestions relevant to the next engineering step.",
    schemaSection
  ].join("\n");
}
var RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Concise 1-3 sentence executive summary of the solution."
    },
    primaryCode: {
      type: Type.STRING,
      description: "Formatted SQL, DDL, or MongoDB query output."
    },
    codeLanguage: {
      type: Type.STRING,
      description: "Code language identifier, e.g. sql or javascript."
    },
    originalCode: {
      type: Type.STRING,
      description: "Original user query when optimizing, debugging, or converting."
    },
    explanationSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Ordered technical walkthrough steps."
    },
    optimizationTips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          impact: { type: Type.STRING, description: "High, Medium, or Low" },
          detail: { type: Type.STRING }
        },
        required: ["title", "impact", "detail"]
      }
    },
    indexRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Executable CREATE INDEX DDL statements."
    },
    debugIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          lineOrClause: { type: Type.STRING },
          severity: { type: Type.STRING, description: "Error, Warning, or Logic" },
          issue: { type: Type.STRING },
          fix: { type: Type.STRING }
        },
        required: ["lineOrClause", "severity", "issue", "fix"]
      }
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
                    references: { type: Type.STRING }
                  },
                  required: ["name", "type"]
                }
              }
            },
            required: ["id", "name", "columns"]
          }
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
              cardinality: { type: Type.STRING, description: "One of 1:1, 1:N, N:1, N:M" },
              label: { type: Type.STRING }
            },
            required: ["id", "fromEntity", "fromColumn", "toEntity", "toColumn", "cardinality"]
          }
        }
      },
      required: ["title", "entities", "relationships"]
    },
    followUpSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["summary"]
};
async function generateNovaResponse(input) {
  const ai = getGeminiClient();
  const historyLines = (input.history ?? []).slice(-6).map((m) => `${m.role === "user" ? "User" : "NOVA"}: ${m.content}`).join("\n");
  const fullPrompt = historyLines ? `Recent conversation context:
${historyLines}

Current request:
${input.prompt}` : input.prompt;
  let response = null;
  let lastError = null;
  for (const model of FALLBACK_MODES) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction: buildSystemInstruction(input.mode, input.dialect, input.schemaContext),
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      });
      if (response?.text) {
        break;
      }
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.code;
      if (status === 404 || status === 503 || String(err?.message).includes("is no longer available")) {
        continue;
      }
      throw err;
    }
  }
  if (!response?.text) {
    throw lastError || new Error("Gemini returned an empty response. Please try again.");
  }
  const rawText = (response.text ?? "").trim();
  if (!rawText) {
    throw new Error("Gemini returned an empty response. Please try again.");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  }
  if (parsed.erDiagram?.relationships) {
    const validCards = /* @__PURE__ */ new Set(["1:1", "1:N", "N:1", "N:M"]);
    parsed.erDiagram.relationships = parsed.erDiagram.relationships.map((r, i) => ({
      ...r,
      id: r.id || `rel_${i + 1}`,
      cardinality: validCards.has(r.cardinality) ? r.cardinality : "1:N"
    }));
  }
  return parsed;
}

// server/createApp.ts
dotenv.config({ path: ".env.local" });
dotenv.config();
var SESSION_COOKIE = "nova_session";
var SESSION_SECRET = process.env.SESSION_SECRET || crypto3.createHash("sha256").update(process.env.APP_URL || "nova-agent-local-secret-2026").digest("hex");
var VALID_MODES = /* @__PURE__ */ new Set([
  "text-to-query",
  "er-diagram",
  "optimize",
  "debug",
  "schema-builder",
  "explain",
  "convert"
]);
var VALID_DIALECTS = /* @__PURE__ */ new Set([
  "postgresql",
  "mysql",
  "sqlite",
  "sqlserver",
  "bigquery",
  "mongodb"
]);
var store = new NovaStore();
function isSecureOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "");
  const appUrl = (process.env.APP_URL || "").trim();
  return process.env.NODE_ENV === "production" || forwardedProto.includes("https") || req.protocol === "https" || appUrl.startsWith("https://");
}
function setAuthCookie(req, res, token) {
  res.setHeader(
    "Set-Cookie",
    buildSessionCookieHeader(SESSION_COOKIE, token, {
      secure: isSecureOrigin(req),
      maxAgeSeconds: 604800
    })
  );
}
function clearAuthCookie(req, res) {
  res.setHeader(
    "Set-Cookie",
    buildSessionCookieHeader(SESSION_COOKIE, "", {
      secure: isSecureOrigin(req),
      maxAgeSeconds: 0
    })
  );
}
function getAuthenticatedUserId(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, SESSION_SECRET);
}
async function createApp(opts) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/robots.txt", (req, res) => {
    const origin = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /auth/",
        "",
        `Sitemap: ${origin}/sitemap.xml`
      ].join("\n")
    );
  });
  app.get("/sitemap.xml", (req, res) => {
    const origin = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const urls = [
      { loc: "/", changefreq: "weekly", priority: "1.0" },
      { loc: "/studio", changefreq: "weekly", priority: "0.9" },
      { loc: "/privacy", changefreq: "monthly", priority: "0.4" },
      { loc: "/terms", changefreq: "monthly", priority: "0.4" }
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(
      (u) => `  <url>
    <loc>${origin}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    ).join("\n")}
</urlset>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });
  const analyticsCounts = {};
  app.post("/api/analytics", (req, res) => {
    const eventName = typeof req.body?.name === "string" ? req.body.name.slice(0, 64) : "";
    if (!eventName) {
      res.status(400).json({ error: "Event name required." });
      return;
    }
    analyticsCounts[eventName] = (analyticsCounts[eventName] ?? 0) + 1;
    res.status(200).json({ ok: true });
  });
  app.post("/api/contact", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (name.length < 2) {
      res.status(400).json({ error: "Please enter your name (at least 2 characters)." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    if (message.length < 10) {
      res.status(400).json({ error: "Message must be at least 10 characters." });
      return;
    }
    res.status(201).json({
      ok: true,
      message: `Thanks ${name}, your inquiry has been received. We will reply to ${email}.`
    });
  });
  app.get("/api/auth/me", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.json({ user: null });
      return;
    }
    const user = store.getUserById(uid);
    res.json({ user });
  });
  app.post("/api/auth/register", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name : "";
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const result = store.registerUser({ name, email, password });
    if (!result.user) {
      res.status(400).json({ error: result.error || "Registration failed." });
      return;
    }
    const sessionToken = signSessionToken(result.user.id, SESSION_SECRET);
    setAuthCookie(req, res, sessionToken);
    res.status(201).json({ user: result.user });
  });
  app.post("/api/auth/login", (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const result = store.authenticateUser({ email, password });
    if (!result.user) {
      res.status(401).json({ error: result.error || "Invalid email or password." });
      return;
    }
    const sessionToken = signSessionToken(result.user.id, SESSION_SECRET);
    setAuthCookie(req, res, sessionToken);
    res.status(200).json({ user: result.user });
  });
  app.post("/api/auth/password", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const result = store.changePassword(uid, currentPassword, newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error || "Password update failed." });
      return;
    }
    res.json({ ok: true, message: "Password updated successfully." });
  });
  app.post("/api/auth/logout", (req, res) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  });
  app.get("/api/auth/providers", (req, res) => {
    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers["x-forwarded-proto"] || req.protocol || "http"),
      req.get("host")
    );
    res.json({
      providers: listOAuthProviderStatuses(process.env, appOrigin)
    });
  });
  app.get("/api/auth/oauth/:provider/url", (req, res) => {
    const rawProvider = String(req.params.provider || "").toLowerCase();
    if (!isOAuthProvider(rawProvider)) {
      res.status(400).json({ error: "Unsupported OAuth provider." });
      return;
    }
    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers["x-forwarded-proto"] || req.protocol || "http"),
      req.get("host")
    );
    const cfg = getOAuthProviderConfig(rawProvider, process.env, appOrigin);
    if (!cfg.clientId || !cfg.clientSecret) {
      res.status(200).json({
        configured: false,
        url: null,
        error: `${cfg.name} sign-in requires ${cfg.envVars.join(" and ")} to be configured in your environment variables.`,
        redirectUri: cfg.redirectUri,
        envVars: cfg.envVars,
        provider: cfg.id
      });
      return;
    }
    const state = signOAuthState(cfg.id, SESSION_SECRET);
    const url = buildOAuthAuthorizationUrl(cfg, state);
    res.json({ configured: true, url, provider: cfg.id });
  });
  app.get(["/auth/callback/:provider", "/auth/callback/:provider/"], async (req, res) => {
    const rawProvider = String(req.params.provider || "").toLowerCase();
    const providerError = typeof req.query.error_description === "string" ? req.query.error_description : typeof req.query.error === "string" ? req.query.error : "";
    const sendPopupError = (status, message) => {
      res.status(status).send(`<!doctype html>
<html><body style="font-family:sans-serif;padding:24px;background:#efece6;color:#141414;">
  <p>${message.replace(/</g, "&lt;")}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(message)} }, '*');
      window.close();
    }
  </script>
</body></html>`);
    };
    if (!isOAuthProvider(rawProvider)) {
      sendPopupError(400, "Unsupported OAuth provider.");
      return;
    }
    if (providerError) {
      sendPopupError(400, `Authorization cancelled: ${providerError}`);
      return;
    }
    const appOrigin = resolveAppOrigin(
      process.env.APP_URL,
      String(req.headers["x-forwarded-proto"] || req.protocol || "http"),
      req.get("host")
    );
    const cfg = getOAuthProviderConfig(rawProvider, process.env, appOrigin);
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!cfg.clientId || !cfg.clientSecret) {
      sendPopupError(500, `${cfg.name} OAuth credentials are not configured on the server.`);
      return;
    }
    if (!code || !verifyOAuthState(state, cfg.id, SESSION_SECRET)) {
      sendPopupError(400, "Invalid or expired OAuth state. Please try signing in again.");
      return;
    }
    try {
      const tokenBody = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code"
      });
      const tokenRes = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: tokenBody.toString()
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(
          tokenJson.error_description || tokenJson.error || `${cfg.name} did not return an access token.`
        );
      }
      const profRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
      });
      const prof = await profRes.json();
      const name = prof.name || "";
      const email = prof.email || "";
      if (!email) {
        throw new Error("Could not read a verified email address from Google.");
      }
      const user = store.upsertOAuthUser({ provider: "google", name, email });
      const sessionToken = signSessionToken(user.id, SESSION_SECRET);
      setAuthCookie(req, res, sessionToken);
      res.send(`<!doctype html>
<html><body style="font-family:sans-serif;padding:24px;background:#efece6;color:#141414;">
  <p>Authentication successful. Returning to NOVA AGENT...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: ${JSON.stringify(cfg.id)} }, '*');
      window.close();
    } else {
      window.location.href = '/studio';
    }
  </script>
</body></html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${cfg.name} OAuth login failed.`;
      sendPopupError(500, msg);
    }
  });
  app.get("/api/sessions", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    res.json({ sessions: store.listSessions(uid) });
  });
  app.post("/api/sessions", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const mode = VALID_MODES.has(req.body?.mode) ? req.body.mode : "text-to-query";
    const dialect = VALID_DIALECTS.has(req.body?.dialect) ? req.body.dialect : "postgresql";
    const session = store.createSession(uid, {
      title: typeof req.body?.title === "string" ? req.body.title : "New Query",
      mode,
      dialect,
      schemaContext: typeof req.body?.schemaContext === "string" ? req.body.schemaContext : ""
    });
    res.status(201).json({ session });
  });
  app.patch("/api/sessions/:id", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const title = typeof req.body?.title === "string" ? req.body.title : "";
    const updated = store.renameSession(uid, req.params.id, title);
    if (!updated) {
      res.status(400).json({ error: "Could not rename session." });
      return;
    }
    res.json({ session: updated });
  });
  app.delete("/api/sessions", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const current = store.listSessions(uid);
    for (const s of current) {
      store.deleteSession(uid, s.id);
    }
    res.json({ ok: true });
  });
  app.delete("/api/sessions/:id", (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const deleted = store.deleteSession(uid, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    res.json({ ok: true });
  });
  app.post("/api/chat", async (req, res) => {
    const uid = getAuthenticatedUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Please sign in before submitting a prompt to NOVA AGENT." });
      return;
    }
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const mode = VALID_MODES.has(req.body?.mode) ? req.body.mode : "text-to-query";
    const dialect = VALID_DIALECTS.has(req.body?.dialect) ? req.body.dialect : "postgresql";
    const schemaContext = typeof req.body?.schemaContext === "string" ? req.body.schemaContext : "";
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : void 0;
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!prompt) {
      res.status(400).json({ error: "Please enter a query, schema description, or question." });
      return;
    }
    try {
      const payload = await generateNovaResponse({
        prompt,
        mode,
        dialect,
        schemaContext,
        history
      });
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const userMessage = {
        id: `msg_${crypto3.randomUUID().slice(0, 10)}`,
        role: "user",
        mode,
        dialect,
        content: prompt,
        createdAt: now
      };
      const assistantMessage = {
        id: `msg_${crypto3.randomUUID().slice(0, 10)}`,
        role: "assistant",
        mode,
        dialect,
        content: payload.summary,
        payload,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      let persistedSession = null;
      const derivedTitle = prompt.length > 42 ? `${prompt.slice(0, 42).trim()}\u2026` : prompt;
      if (sessionId) {
        persistedSession = store.appendMessages(uid, sessionId, [userMessage, assistantMessage], {
          mode,
          dialect,
          schemaContext
        });
      }
      if (!persistedSession) {
        const created = store.createSession(uid, {
          title: derivedTitle,
          mode,
          dialect,
          schemaContext
        });
        persistedSession = store.appendMessages(uid, created.id, [userMessage, assistantMessage]);
      }
      res.json({
        userMessage,
        assistantMessage,
        session: persistedSession
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reach Gemini right now. Please try again.";
      const status = message.includes("API_KEY_INVALID") || message.includes("PERMISSION_DENIED") ? 403 : message.includes("RESOURCE_EXHAUSTED") ? 429 : 500;
      res.status(status).json({ error: message });
    }
  });
  if (!opts?.isServerless) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path2.resolve(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path2.join(distPath, "index.html"));
      });
    }
  }
  return app;
}

// server/vercelHandler.ts
var appPromise = null;
async function handler(req, res) {
  if (!appPromise) {
    appPromise = createApp({ isServerless: true });
  }
  const app = await appPromise;
  return app(req, res);
}
export {
  handler as default
};
