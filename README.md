# NOVA AGENT — AI Database & Query Intelligence Engine

NOVA AGENT is a database architect and query intelligence engine built with React 19, TypeScript, Tailwind CSS, Express, and Google Gemini AI.

## Features

- **Text-to-Query:** Convert natural-language requests into production-grade SQL (PostgreSQL, MySQL, SQLite, SQL Server, BigQuery) and MongoDB aggregation pipelines.
- **Visual ER Diagrams:** Render interactive Entity-Relationship diagrams from DDL or AI schema design using Mermaid.js and export to PNG, JPEG, SVG, DBML, and SQL DDL.
- **SQL Optimizer & Debugger:** Pinpoint execution bottlenecks, non-SARGable predicates, join traps, and aggregate errors with automated suggestions and index recommendations.
- **Schema ER & Diff Lab:** Live schema comparison, FK relationship analysis, and schema migrations.
- **Live SQL Linter:** Real-time syntax and anti-pattern linting with instant quick-fixes.
- **Authentication:** Built-in secure user authentication with session management and optional OAuth 2.0 SSO.

## Getting Started

### Prerequisites

- Node.js 20+
- A Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aloksingh70/Nova-Agent.git
   cd Nova-Agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env.local` and add your Gemini API key:
   ```bash
   cp .env.example .env.local
   ```
   Configure `GEMINI_API_KEY="your-gemini-api-key"` in `.env.local`.

4. Start development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

- `npm run dev`: Start local development server with Vite middleware on port 3000.
- `npm run build`: Compile client-side bundle to `dist/`.
- `npm run start`: Start production server.
- `npm run lint`: Run TypeScript compiler check without emitting files.
- `npm test`: Run test suite (Node test runner with 50+ unit and integration tests).

## Deployment

Deployable directly to [Vercel](https://vercel.com) using the included `vercel.json` and serverless API handlers in `api/`.
