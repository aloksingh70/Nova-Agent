# NOVA AGENT — Multi-Model AI Database & Query Intelligence Engine

NOVA AGENT is a production-grade database architect and query intelligence suite built with React 19, TypeScript, Tailwind CSS, Express, and Multi-Model AI orchestration (Google Gemini, DeepSeek, OpenAI, and Anthropic Claude).

**Live Production Deployment:** [https://nova-agent-khaki.vercel.app](https://nova-agent-khaki.vercel.app)  
**GitHub Repository:** [https://github.com/aloksingh70/Nova-Agent.git](https://github.com/aloksingh70/Nova-Agent.git)

---

## 🚀 Multi-Model Engine Architecture

NOVA AGENT features an interactive **AI Model Switcher** button located in the top navigation bar and above the prompt composer. Users can switch foundation models with a single click:

| Model | Provider | Official Logo | Status | Best For |
| :--- | :--- | :---: | :---: | :--- |
| **Gemini 3.5 Flash** | Google | `/models/gemini.png` | **Active · Ready** | Ultra-fast multimodal SQL generation and schema reasoning |
| **DeepSeek V3** | DeepSeek | `/models/deepseek.png` | **Key Added · Needs Credits** | High-capability code & database architecture synthesis |
| **GPT-4o Mini** | OpenAI | `/models/openai.png` | **Key Added · Needs Credits** | Advanced logical reasoning and query optimization |
| **Claude 3.5 Sonnet** | Anthropic | `/models/claude.png` | **Key Added · Needs Credits** | Nuanced SQL DDL design and architectural analysis |

### Model Switcher Features
- **Official Brand Logos & Badges:** Displays official icons for Google Gemini, DeepSeek, OpenAI, and Anthropic Claude.
- **Dynamic Status Indication:** Green indicator for active models with credit, and amber indicator for models requiring prepaid credit top-up.
- **Graceful Error Handling:** If an unpaid or exhausted API key is used, NOVA displays a clear, actionable message with a direct link to top up or switch back to the active Google Gemini engine.
- **Persistence:** Selected model preference is automatically preserved in `localStorage`.

---

## 💡 About API Naming: "Gapi" vs Gemini API

> **FAQ:** *In original Google documentation or sites, you might see "gapi". Does having a different variable name cause any issues?*
>
> **No issue at all.** "gapi" refers to Google's legacy client library (`gapi.client` / Google Identity Services). For modern generative AI, Google uses the official `@google/genai` SDK and the industry-standard environment variable `GEMINI_API_KEY`. NOVA AGENT uses the modern `@google/genai` v3 SDK with `GEMINI_API_KEY`, which provides maximum speed, streaming, and schema generation capabilities.

---

## 🛠️ Key Capabilities

- **Text-to-Query:** Convert natural-language requests into production-grade SQL (PostgreSQL, MySQL, SQLite, SQL Server, BigQuery) and MongoDB aggregation pipelines.
- **Visual ER Diagrams:** Render interactive Entity-Relationship diagrams from DDL or AI schema design using Mermaid.js and export to PNG, JPEG, SVG, DBML, JSON Schema, and SQL DDL.
- **SQL Optimizer & Debugger:** Pinpoint execution bottlenecks, non-SARGable predicates, join traps, and aggregate errors with automated suggestions and index recommendations.
- **Schema ER & Diff Lab:** Live schema comparison, FK relationship analysis, and schema migrations between versions.
- **Live SQL Linter:** Real-time syntax and anti-pattern linting with instant quick-fixes in a customized Prism-powered editor.
- **FIFO Message Queue:** Queue multiple prompts while queries run, reorder, edit, or pause execution on the fly.
- **Authentication:** Built-in secure user authentication with session management and optional Google OAuth 2.0 SSO.

---

## 📦 Getting Started

### Prerequisites

- Node.js 20+
- An API Key from one or more supported providers (Google Gemini is recommended for instant out-of-the-box readiness).

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aloksingh70/Nova-Agent.git
   cd Nova-Agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
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

4. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Validation

Run the automated test suite covering authentication, schema parsing, SQL linting, ER diagram generation, and multi-model routing:
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

## 🌐 Deployment to Vercel

The project is preconfigured for zero-config Vercel deployment:
- `vercel.json` routes static requests to `dist/` and `/api/*` to the bundled serverless handler `api/index.js`.
- Environment variables (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, etc.) can be set in the Vercel Project Dashboard or via Vercel CLI:
  ```bash
  npx vercel env add GEMINI_API_KEY
  npx vercel --prod
  ```

---

## 📄 License

MIT License. Built by Alok Singh.
