# ORM Dashboard

A full-stack dashboard that ingests social media posts/comments **exclusively from Apify**, runs AI-based sentiment analysis on them, and displays the results. This application does **not** scrape anything itself — it is a consumer/processor of whatever your configured Apify Actor/Task/Dataset returns.

```
Keyword → Apify API → raw posts/comments → normalize → extract text
        → AI sentiment API → POSITIVE/NEGATIVE/NEUTRAL → store → dashboard
```

## Project layout

```
backend/    Node.js + TypeScript + Express API, Prisma ORM, SQLite DB
frontend/   React + TypeScript + Vite dashboard (Recharts for charts)
```

### Backend module map (matches the required modular architecture)

| Module | File | Responsibility |
|---|---|---|
| ApifyService | [backend/src/services/apifyService.ts](backend/src/services/apifyService.ts) | The **only** module that calls Apify. |
| DataNormalizer | [backend/src/services/dataNormalizer.ts](backend/src/services/dataNormalizer.ts) | Converts arbitrary Apify item shapes into internal Post/Comment shapes. |
| SentimentService | [backend/src/services/sentimentService.ts](backend/src/services/sentimentService.ts) | The **only** module that calls the AI provider. Swap providers here without touching Apify code. |
| PipelineService | [backend/src/services/pipelineService.ts](backend/src/services/pipelineService.ts) | Orchestrates Keyword → Apify → Normalize → DB → AI → DB. |
| QueryService | [backend/src/services/queryService.ts](backend/src/services/queryService.ts) | All read queries for the dashboard (overview, filters, charts, search). |
| DB schema | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Keyword, ScrapeRun (raw response), Post, Comment. |
| Dashboard API | [backend/src/routes](backend/src/routes) | Express routes consumed only by the frontend. |

## Prerequisites

- Node.js 18+ (tested on Node 22)
- An Apify account with an Actor/Task that scrapes the social platform(s) you care about, plus its API URL and token
- An OpenAI-compatible AI API (OpenAI, Azure OpenAI, OpenRouter, Ollama, etc.)

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and fill in:

```env
APIFY_API_URL=...        # e.g. https://api.apify.com/v2/acts/<actor-id>/run-sync-get-dataset-items
APIFY_API_KEY=...
APIFY_METHOD=POST        # POST to run an actor/task, GET to fetch an existing dataset's items
APIFY_INPUT_TEMPLATE={"searchTerms":["{{keyword}}"],"maxItems":100}   # match your Actor's input schema

AI_API_URL=...           # e.g. https://api.openai.com/v1/chat/completions
AI_API_KEY=...
AI_MODEL=gpt-4o-mini

SERPER_API_KEY=...       # e.g. https://serper.dev API key for Google SERP scraping
```

See the comments in [backend/.env.example](backend/.env.example) for the full list of options (timeouts, concurrency, CORS origin, database URL).

Create the database and generate the Prisma client:

```bash
npx prisma migrate dev --name init
```

This creates a local SQLite file at `backend/prisma/dev.db`. To use PostgreSQL instead, change `provider = "sqlite"` to `provider = "postgresql"` in `backend/prisma/schema.prisma`, set `DATABASE_URL` to a `postgresql://` connection string, then re-run the migrate command.

Run the backend:

```bash
npm run dev
```

The API listens on `http://localhost:4000` (configurable via `PORT`). `GET /api/health` reports whether Apify/AI are configured.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Opens on `http://localhost:5173`. `VITE_API_BASE_URL` in `frontend/.env` controls which backend it talks to (defaults to `http://localhost:4000/api`). The frontend never sees `APIFY_API_KEY` or `AI_API_KEY` — all calls to Apify and the AI provider happen server-side only.

## Using it

1. Open the dashboard, type a keyword (e.g. `"Dubai real estate"`) into **Run a new Apify scrape**, and submit.
2. The backend calls your configured Apify endpoint, stores the raw response untouched, normalizes it into posts/comments, then runs each item through the AI sentiment API.
3. Results appear in **Overview** (stats + charts), **Posts & Comments** (filterable/searchable feed), **Competitor Analysis** (basic competitor card scraping without AI sentiment), **Negative Mentions**, **Neutral Mentions**, **Positive Mentions**, and global **Search**.
4. Items where sentiment analysis failed (AI error, rate limit, etc.) show up under **Failed / Retry** — the original scraped data and text are preserved, and you can retry analysis without re-scraping.

## Adapting to your actual Apify response

The normalizer ([backend/src/services/dataNormalizer.ts](backend/src/services/dataNormalizer.ts)) reads a broad set of common field-name variants (`text`/`caption`/`content`, `url`/`postUrl`/`link`, `author`/`username`/`ownerUsername`, etc.) and never invents data — anything it can't find stays `null`. Once you run a real scrape:

1. Check the stored raw response for a `ScrapeRun` (via `npx prisma studio` in `backend/`, table `ScrapeRun.rawResponse`) to see the exact shape your Actor returns.
2. If your Actor uses field names not already covered, add them to the relevant key list at the top of `dataNormalizer.ts` (e.g. `POST_TEXT_KEYS`, `AUTHOR_NAME_KEYS`).
3. No other module needs to change — normalization is fully isolated from the Apify call and from sentiment analysis.

## Swapping the AI provider later

Everything AI-specific lives in [backend/src/services/sentimentService.ts](backend/src/services/sentimentService.ts), which assumes an OpenAI-compatible `/chat/completions` endpoint. To use a differently-shaped API, rewrite `callChatCompletions` in that one file — `ApifyService`, `DataNormalizer`, the database schema, and the dashboard are unaffected.

## Error handling & data integrity

- Apify errors (bad key, bad URL, timeout, empty/malformed response) are caught in `ApifyService` and surfaced as readable messages — never raw stack traces or secrets — and a failed `ScrapeRun` row is still recorded.
- The raw Apify response is written to the database **before** normalization or AI analysis runs, so nothing is lost if a later step fails.
- Each Post/Comment has a `status`: `RECEIVED → PROCESSING → ANALYZED` or `FAILED`. Failed items keep their original text/raw data and can be retried individually from the **Failed / Retry** page (or `POST /api/retry/post/:id` / `/api/retry/comment/:id`).
- Every Post/Comment has a unique `sourceKey` derived from the source ID, then URL, then a content hash as a last resort — re-scraping the same keyword will not create duplicates or re-run AI analysis on items already analyzed.

## What this project deliberately does not do

Per the project requirements, there is no custom scraping logic, no browser automation (Playwright/Puppeteer/Selenium), no alternative scraping providers, and no proxy/bypass logic anywhere in this codebase. `ApifyService` is the sole entry point for raw data, and it only ever calls the `APIFY_API_URL`/`APIFY_API_KEY` you provide.
