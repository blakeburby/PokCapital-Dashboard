# CLAUDE.md — PokCapital Dashboard

Operating manual for Claude Code when working in this repository.

---

## Project Overview

**PokCapital Dashboard** is a production real-time trading algorithm monitoring UI built with **Next.js 15 (App Router)**, **React 19**, and **TypeScript 5**. It displays live, paper, and real Kalshi account trading data from a Railway-hosted backend.

The dashboard is a **read-only observability interface** — it does not issue trades. All trading logic lives in the backend repository. Changes here affect UI, data display, and API proxy routes only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.2.6 (App Router) |
| Language | TypeScript 5.7.3 (strict mode) |
| UI | React 19.0.0 |
| Styling | Tailwind CSS 3.4.17 (dark theme, utility-first) |
| Charting | Recharts 2.12.7 |
| Data Fetching | SWR 2.2.5 |
| Tables | TanStack React Table 8.19.3 |
| Icons | Lucide React 0.447.0 |
| Package Manager | npm |
| Linting | ESLint 9 (next/core-web-vitals) |

---

## Repository Structure

```
src/
  app/
    page.tsx               # Root dashboard layout (main entry)
    layout.tsx             # HTML shell, metadata
    globals.css            # CSS variables, custom utilities
    api/
      health/route.ts      # Proxy: backend health
      stats/route.ts       # Proxy: strategy stats
      trades/route.ts      # Proxy: trade history
      fills/route.ts       # Proxy: Kalshi account fills
      balance/route.ts     # Proxy: account balance
      logs/route.ts        # Proxy: deployment logs
      market/route.ts      # Proxy: Kalshi market prices
  components/
    BackendStatusPanel.tsx # Health, uptime, worker status
    RealTradingSection.tsx # Kalshi real account section
    KalshiFillsStats.tsx   # Real account metrics (PnL, Sharpe, etc.)
    KalshiFillsTable.tsx   # Real fills history table
    RealAccountChart.tsx   # Account value over time
    LiveTradingSection.tsx # Live trading section container
    LiveOverviewCards.tsx  # Live trading summary cards
    LiveTradeTable.tsx     # Live trade history
    LiveStatsCards.tsx     # Live stats metrics
    PaperTradingSection.tsx# Paper trading section container
    StatsCards.tsx         # Paper strategy overview cards
    TradeTable.tsx         # Paper trade history table
    PnlChart.tsx           # Cumulative P&L chart (Recharts)
    PriceFeeds.tsx         # Binance/Coinbase/Kraken prices
    MonteCarloChart.tsx    # GBM simulation visualization
    LogsPanel.tsx          # Terminal-style log viewer
    StrategyState.tsx      # Current algorithm state display
    DataSourceFooter.tsx   # Data attribution footer
  lib/
    api.ts                 # All API types, fetch functions, helpers
    montecarlo.ts          # GBM Monte Carlo simulation engine
tailwind.config.ts         # Custom dark theme colors + animations
next.config.ts             # reactStrictMode: true
tsconfig.json              # strict, bundler resolution, @/* alias
.env.example               # Required environment variables
```

---

## Environment Variables

```bash
# Required — Railway backend URL
NEXT_PUBLIC_API_BASE=https://pokcapitalweb-production.up.railway.app
```

`NEXT_PUBLIC_` prefix means this value is embedded in the client bundle. Never store secrets here.

---

## Development Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Run production build locally
npm run lint     # Run ESLint (next/core-web-vitals)
```

Always run `npm run build` before marking any task complete. TypeScript errors surface at build time.

---

## Architecture

### Data Flow

```
Browser Components
  → SWR polling (5–10s intervals)
    → Next.js API routes (/src/app/api/*)
      → Railway Backend (NEXT_PUBLIC_API_BASE)
        → Kalshi API (market results, fills)

Browser Components (PriceFeeds)
  → Direct fetch (no proxy)
    → Binance / Coinbase / Kraken public APIs
```

### API Proxy Pattern

All backend calls go through `/src/app/api/*` routes. These routes:
- Forward requests to `NEXT_PUBLIC_API_BASE`
- Set `cache: "no-store"` to force real-time data
- Handle CORS for browser → Railway communication

Never call the Railway backend directly from client components. Always go through the proxy routes.

### Client vs Server Components

- All interactive components use `"use client"` directive
- API route files (`route.ts`) are server-only
- `layout.tsx` is a server component (no hooks, no state)
- Do not mix client/server boundaries without understanding the implications

### State Management

- **SWR**: All remote data (trades, stats, fills, health, logs)
- **useState / useRef**: Local UI state (filters, scroll position, toggled rows)
- **localStorage**: Persistent UI state (hidden/collapsed trade rows)
- No global state library (Redux, Zustand, etc.) — do not add one without discussion

---

## Key Data Types

Defined in [src/lib/api.ts](src/lib/api.ts). Do not create duplicate types.

```typescript
// Core trade record
interface Trade {
  id: string
  asset: string
  floorStrike: number
  closeTime: string
  regime: "R1" | "R2" | "R3"       // Volatility regime
  direction: "yes" | "no"
  entryPrice: number
  modelProbability: number
  outcome: "win" | "loss" | "pending"
  pnlCents: number
  isLive?: boolean                  // true = live capital, false = paper
  orderId?: string
}

// Backend health snapshot
interface BackendHealth {
  status: "ok" | "error" | "unreachable"
  uptime: number
  liveTradingEnabled: boolean
  activeWorkers: number
  engineConfig: { evMinCents, evMaxCents, minEntryPriceCents, ... }
}

// Aggregate strategy stats
interface Stats {
  totalTrades: number
  winRate: number
  totalPnlCents: number
  profitFactor: number
  sharpeApprox: number
}
```

---

## Polling Intervals

| Data | Interval | Component |
|---|---|---|
| Backend health | 10s | BackendStatusPanel |
| Stats, trades, fills, logs | 5s | All data components |
| Balance | 5s | RealTradingSection |
| Kalshi market prices | 5s | KalshiFillsStats |

Do not reduce polling intervals without considering Railway rate limits and Kalshi API quotas.

---

## Tailwind Theme

Custom colors defined in [tailwind.config.ts](tailwind.config.ts). Always use these instead of hardcoded hex values:

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0F1A` | Page background |
| `panel` | `#121826` | Card/panel background |
| `accent` | `#3B82F6` | Primary actions, highlights |
| `profit` | `#10B981` | Wins, positive PnL |
| `loss` | `#EF4444` | Losses, errors |
| `muted` | `#6B7280` | Secondary text |
| `border` | `#1F2937` | Borders, dividers |
| `text` | `#E5E7EB` | Primary text |

Custom animations: `flash-green`, `flash-red` (trade confirmation flashes).

---

## Planning Rules

### Always Plan Before Coding

Before writing any code, use **EnterPlanMode** to:
1. Read all files relevant to the task
2. Identify what needs to change and why
3. Describe the approach and affected files
4. Confirm before touching any critical file

For **any change touching more than one component or API route**, explicitly list every file that will be modified before starting.

### Complex Task Breakdown

If a task spans multiple components or systems:
1. Identify all affected files
2. Define the order of changes (types → API → components → page)
3. Work through each sub-task sequentially
4. Summarize what changed after each step

---

## Architecture Protection Rules

- **Do not refactor working components** unless explicitly requested
- **Do not change the API proxy pattern** — all backend calls must go through `/src/app/api/`
- **Do not add new global state libraries** without discussion
- **Do not change the Tailwind theme tokens** without confirming the full visual impact
- **Do not rewrite `src/lib/api.ts`** — it is the canonical type and fetch layer for the entire app
- **Do not change `src/lib/montecarlo.ts`** without understanding the GBM simulation logic
- **Do not modify `next.config.ts`** without checking for build-breaking side effects
- Before deleting or renaming any exported type in `api.ts`, search all components that import it

---

## Debugging Protocol

When investigating a bug or broken feature:

1. **Identify**: Reproduce the issue. Note the component, data, and error message
2. **Trace**: Follow the data path — component → SWR hook → API route → backend
3. **Isolate**: Determine which layer is failing (component render, fetch, proxy, backend)
4. **Fix**: Apply the smallest change that resolves the issue
5. **Verify**: Run `npm run build` and visually confirm the fix in `npm run dev`

For UI bugs, always check:
- Is the component using `"use client"`?
- Is SWR configured with the correct key and fetcher?
- Is the data shape matching the TypeScript type?

For API bugs, always check:
- Is the proxy route forwarding the correct URL and method?
- Is `cache: "no-store"` set?
- Is the backend returning the expected JSON shape?

---

## Verification Before Completion

Before marking any task done:

- [ ] `npm run build` completes with zero TypeScript errors
- [ ] `npm run lint` passes with no new errors
- [ ] Visually verified the change in `npm run dev` at localhost:3000
- [ ] If types were changed, all consumers of those types are updated
- [ ] If a new API route was added, it follows the existing proxy pattern
- [ ] If a new component was added, it has proper `"use client"` or is confirmed server-safe
- [ ] Explain what changed and why in your final response

---

## Safe Editing Rules

- **One concern per change**: Do not fix unrelated issues in the same diff
- **No speculative improvements**: Only change what the task requires
- **No new dependencies** without discussing the tradeoff first
- **No inline secrets**: All config goes through environment variables
- **No `any` types**: If the type is unknown, investigate the actual shape
- When in doubt about a component's purpose, read it before touching it

---

## Code Quality Standards

- **TypeScript strict mode is on** — no `@ts-ignore` without a documented reason
- **No unused imports or variables** — ESLint will flag these
- **Consistent naming**: Components use `PascalCase`, hooks use `camelCase` with `use` prefix
- **SWR keys** must be unique strings that encode all parameters (include query params)
- **Data formatting**: Dollar amounts display as cents internally (`pnlCents`), convert for display
- **Keep components focused**: A component should render UI, not contain business logic
- **Do not duplicate fetch logic** — use the functions exported from `src/lib/api.ts`

---

## Lessons Learned

> This section is append-only. Add a new entry when the user corrects a mistake. Format: `- [Date] Rule: description.`

- [2026-03-09] Never call the Railway backend directly from client components — all backend requests must route through `/src/app/api/*` proxy routes to avoid CORS errors.
- [2026-03-09] `NEXT_PUBLIC_` env vars are embedded at build time. Changing them requires a rebuild, not just a restart.
- [2026-03-09] Do not assume Next.js Pages Router patterns apply — this project uses App Router exclusively. `"use client"` is required for any component using hooks or browser APIs.
