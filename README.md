# NOVA AGENT — Multi-Model AI Database Architecture & Query Intelligence Engine

NOVA AGENT is an enterprise-grade database architect, SQL optimization suite, and query intelligence workspace built with React 19, TypeScript, Tailwind CSS, Express, and Multi-Model AI orchestration (Google Gemini, DeepSeek, OpenAI, and Anthropic Claude).

**Live Production Application:** [https://nova-agent-sql-ai.vercel.app/](https://nova-agent-sql-ai.vercel.app/)

---

## 🌟 Key Highlights & Feature Suite

### 1. 🚀 Multi-Model Engine Switcher
Switch between world-class AI models on the fly directly from the top navigation bar or above the prompt composer:
- **Google Gemini 3.5 Flash** (`gemini-3.5-flash-lite`): Ultra-fast multimodal SQL generation, complex schema reasoning, and sub-second structured JSON responses (**Active · Ready**).
- **DeepSeek V3** (`deepseek-chat`): High-capability code & database architecture synthesis.
- **OpenAI GPT-4o Mini** (`gpt-4o-mini`): Advanced logical reasoning, indexing strategies, and query optimization.
- **Anthropic Claude 3.5 Sonnet** (`claude-3-5-sonnet`): Nuanced SQL DDL design, safety hazard analysis, and architectural planning.
- **Visual Provider Branding:** Official brand logos, status badges (`Active · Ready` vs `Key Added · Needs Credits`), and automatic persistence in `localStorage`.

### 2. ⚡ In-Browser Live SQL Sandbox (Instant Query Execution)
- **Zero-Setup Embedded SQL Engine:** Execute relational queries, DDL, and DML right inside the browser without needing an external database server.
- **Comprehensive Syntax Support:** Handles `CREATE TABLE`, `INSERT INTO`, `SELECT`, `WHERE`, `ORDER BY`, `LIMIT`, and aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`).
- **AI Realistic Seed Data Generator:** 1-click **Generate Seed Data** button that inspects table columns and generates mock `INSERT INTO` rows tailored to your schema (names, emails, prices, categories, dates) for immediate join and window function testing.
- **Performance Benchmarking:** Real-time execution timer displaying query duration in milliseconds, affected row counts, and interactive result tables.

### 3. 🔍 Visual EXPLAIN ANALYZE Query Plan Explorer
- **Interactive Execution Plan Tree:** Paste PostgreSQL or MySQL `EXPLAIN (ANALYZE, FORMAT JSON)` or text execution plans into the studio to visualize the query plan as a hierarchical node tree.
- **Bottleneck Detection:** Automatically scans nodes to highlight critical performance hotspots:
  - Sequential Scans (`Seq Scan`) on large tables.
  - Costly nested loops and unindexed hash joins.
  - High-cost in-memory sorts and spills.
  - Large row count estimation mismatches (planned vs actual).
- **1-Click Plan Optimization:** "Optimize This Plan" sends the execution plan tree and schema context directly into the AI to recommend covering/composite indexes and query rewrites.

### 4. 🧠 Schema-Aware Autocomplete & Live SQL Linting
- **Context-Aware Autocomplete:** Connects active schema DDL to the live SQL editor:
  - Typing `FROM ` or `JOIN ` automatically suggests table names from your schema.
  - Typing `<table_name>.` displays column names complete with data types (`UUID (PK)`, `VARCHAR`, `TIMESTAMPTZ`, `FK`).
- **Live Schema Lint Warnings (`SQL010`):** Live linter flags columns that do not exist in the active schema (e.g. `SQL010: Column "orders.total" not found in active schema`).
- **Anti-Pattern Prevention:** Detects non-SARGable functions (`YEAR(created_at) = 2026`), `= NULL` comparisons, unindexed foreign keys, and missing `WHERE` clauses on `DELETE`/`UPDATE`.

### 5. 🛡️ Migration Safety & Rollback Script Generator
- **Migration Safety Score (0–100):** Real-time safety audit classifying schema changes into **Destructive**, **Warning**, or **Safe**:
  - Flags critical hazards: `DROP TABLE` or `DROP COLUMN` with existing data.
  - Type narrowing (e.g., `VARCHAR(255)` → `VARCHAR(32)` causing truncation).
  - Adding `NOT NULL` without a default value causing table lockouts.
- **Paired Forward & Rollback DDL:**
  - `migrate.up.sql`: Clean, dialect-specific forward migration script.
  - `migrate.down.sql`: Exact reverse rollback script to safely revert schema changes.
- **ORM Model Exports:** 1-click export of database DDL to **Prisma** (`schema.prisma`), **Drizzle** (`schema.ts`), and **TypeORM** (`entity.ts`).

### 6. 📊 Natural-Language Data Charting (Query → Visual Chart)
- **Instant Visualization:** Automatically graphs query results from the live SQL sandbox into interactive charts:
  - **Bar Charts:** Categorical comparisons with hover tooltips and metric values.
  - **Line Charts:** Time-series trends and trajectories.
  - **KPI Summary Cards:** High-level metrics (Total, Average, Max, Min).
- **Export Options:** 1-click CSV download of raw query datasets.

### 7. 🌐 Multi-Dialect Side-by-Side Translator
- **Cross-Dialect Translation:** Convert queries between **PostgreSQL**, **MySQL**, **SQLite**, **SQL Server (T-SQL)**, **BigQuery**, and **MongoDB Aggregation Pipelines**.
- **Side-by-Side Diffing:** Highlights dialect-specific syntax differences (e.g., `ILIKE` → `LOWER() LIKE`, `DATE_TRUNC` → `DATE_FORMAT`, `LIMIT` → `TOP`).
- **Compatibility Scoring:** Real-time compatibility index with caveats and feature translation notes.

### 8. 🖼️ Mermaid.js ER Diagram PNG & SVG Export
- **Architecture Visualization:** Renders interactive Entity-Relationship diagrams from DDL or AI designs.
- **1-Click High-Res Export:** Direct **Export PNG** and **Export SVG** buttons on the diagram canvas for effortless architecture documentation.

### 9. 🕒 Recent Queries Cache & Quick-Cycle Navigation
- **Session Cache:** Caches the last 10 successful SQL queries per session in `localStorage`.
- **Keyboard & Button Navigation:** Rapidly cycle through previous queries using `Prev` and `Next` buttons, or choose directly from the `Recent (N)` dropdown.

### 10. 📋 One-Click Copy to Clipboard
- Integrated copy button on every SQL output block with instant visual confirmation and clipboard fallback.

### 11. 📥 FIFO Message Queue System
- Asynchronous prompt queue allowing users to batch multiple database requests while queries run.
- Supports pausing, reordering (move up/down), editing, and automatic dispatching in FIFO order.

---

## 🛠️ Supported Database Dialects

| Dialect | Dialect Features |
| :--- | :--- |
| **PostgreSQL** | JSONB, CTEs, Window functions, ILIKE, SERIAL/BIGSERIAL, EXPLAIN ANALYZE |
| **MySQL 8** | Window functions, CTEs, AUTO_INCREMENT, DATE_FORMAT, EXPLAIN FORMAT=JSON |
| **SQLite** | In-memory execution, AUTOINCREMENT, strftime, portable schema definitions |
| **SQL Server** | TOP N, IDENTITY, DATEPART, T-SQL constraints |
| **Google BigQuery** | Standard SQL, partition/cluster decorators, TIMESTAMP_TRUNC |
| **MongoDB** | Aggregation pipelines (`$match`, `$group`, `$lookup`, `$project`, `$sort`) |

---

## 📦 Getting Started

### Prerequisites
- Node.js 20+
- An API Key from one or more supported providers (Google Gemini recommended for out-of-the-box readiness).

### Installation & Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Add your keys in `.env.local`:
   ```env
   # Google Gemini (Active)
   GEMINI_API_KEY="your-gemini-api-key"
   GEMINI_MODEL="gemini-3.5-flash-lite"

   # DeepSeek (Optional)
   DEEPSEEK_API_KEY="your-deepseek-api-key"

   # OpenAI (Optional)
   OPENAI_API_KEY="your-openai-api-key"

   # Anthropic Claude (Optional)
   ANTHROPIC_API_KEY="your-anthropic-api-key"

   # App URL
   APP_URL="http://localhost:3000"
   ```

3. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Quality Assurance

Run the automated test suite covering all 70 test cases (authentication, embedded SQL database, migration safety checks, dialect translation, query plan parsing, schema linting, and ER diagram layout):
```bash
npm test
```

Run TypeScript compilation check:
```bash
npm run lint
```

Build production client & serverless bundle:
```bash
npm run build
```

---

## 🌐 Production Deployment

The project is preconfigured for zero-config Vercel deployment:
- `vercel.json` routes static requests to `dist/` and `/api/*` to the bundled serverless handler `api/index.js`.
- Environment variables (`GEMINI_API_KEY`, etc.) can be configured via Vercel Project Settings or CLI:
  ```bash
  npx vercel env add GEMINI_API_KEY
  npx vercel --prod
  ```

---

## 📄 License

MIT License. Designed and engineered for high-performance database teams.
