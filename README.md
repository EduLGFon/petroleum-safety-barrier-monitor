# Petroleum Safety Barrier Monitor

Real-time dashboard for monitoring industrial safety barrier compliance across oil & gas installations. Built to track thousands of safety barriers spanning severak installations,
surfacing which ones are non-conforming and for how long they've gone without contingency.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Deno](https://img.shields.io/badge/Deno-2-000000)

---

## Features

- **Live filtering & search** — by installation, disponibilidade, conformidade, category, and free-text TAG/location search, all state-persisted across reloads
- **6-state operational model** — Disponível, Fora de Operação, Indisponível/Degradado Contingenciado, Degradado, Indisponível — with conformity always *derived*, never independently tracked, so the two can't drift out of sync
- **Urgent-first sorting** — one click surfaces non-conforming barriers ordered by longest time without contingency
- **Barrier detail modal** — full field breakdown plus a status-change history timeline
- **Bulk export** — selected barriers to styled Excel (ExcelJS), PDF (jsPDF) or CSV
- **Settings panel** — theme (light/dark/AMOLED), 7 accent color presets, default location/filters on load, reduce-motion toggle
- **Full state persistence** — location, filters, sort, selection and open modal all restore on reload
- **Light/Dark/AMOLED themes** with WCAG-conscious contrast tokens per theme

## Tech Stack

- **[Next.js 15](https://nextjs.org/)** (App Router) + **React 19**
- **[Deno](https://deno.com/)** as the runtime/task runner, consuming npm packages via its Node compatibility layer
- **TypeScript**, strict mode
- **[Recharts](https://recharts.org/)** for the conformity-by-category chart
- **ExcelJS** / **jsPDF** for styled spreadsheet and PDF export

## Getting Started

```bash
# with Deno (recommended)
deno task dev

# or with npm
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

All data flows through a single, unified API client — no component talks to the mock generator or a backend directly:

```
components/Dashboard.tsx
        │
        ▼
hooks/useDashboard.ts
        │
        ▼
   lib/api.ts  ◄── single entry point
   ├── mockAdapter  (lib/data.ts — deterministic seeded generator)
   └── httpAdapter  (fetch-based, same contract, real backend)
```

Every enumerable domain (location, status, criticality, category, etc.) has a **numeric id resolver** in `lib/enums.ts` — the same contract a real backend would use (`toLocationId('FAL') // -> 1`), so swapping the mock for a live API requires zero changes anywhere else in the app.

```bash
# .env.local
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=https://your-backend.com
```

See [`docs/API.md`](./docs/API.md) for the full wire format and the three REST endpoints a real backend needs to implement.

## Project Structure

```
app/            Next.js App Router entry (layout, page, global styles)
components/     Dashboard UI (table, modal, filters, charts, settings panel)
components/ui/  Shared primitives (icons, badges, logo)
context/        Theme & settings providers
hooks/          useDashboard — the single state-management hook
lib/            Domain types, enums/resolvers, API client, export logic
docs/           Architecture documentation
```
