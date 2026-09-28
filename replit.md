# CertaProof

CertaProof is an analyst-focused security assessment workspace for authorized World Monitor fixture testing, evidence capture, remediation, re-testing, and disclosed reporting.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React, Vite, TypeScript, Tailwind CSS, TanStack Query, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/certaproof/src/App.tsx` — routed application shell and demo workflow pages
- `artifacts/certaproof/src/index.css` — shared CertaProof visual tokens and responsive styles
- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `artifacts/api-server/src/routes/certaproof.ts` — isolated deterministic fixture API
- `lib/api-client-react/src/generated/` — generated React Query client and schemas

## Architecture decisions

- The first usable path is the controlled synthetic authorization fixture, never an automatic scan of the public World Monitor URL.
- Evidence origin is always surfaced as simulated demonstration, executed local fixture, or authorized target; unavailable integrations are shown as Not connected.
- Validation, remediation, and verification are separate state transitions. Applying a fix never implies that it was verified.
- The API starts with deterministic in-memory fixture state so the demonstration works without external services; the OpenAPI contract is ready for durable persistence and worker-backed execution.

## Product

- Overview command center with assessment progress, coverage, activity, and proof-loop guidance.
- Assessment register and three-step scoped assessment wizard.
- Reference attack-surface map, four-case authorization validation matrix, findings register/detail, evidence viewer, remediation/re-test workflow, report generation, integrations, settings, and guided demo.
- Reports support HTML, JSON, SARIF, and print-to-PDF paths while retaining the synthetic-fixture disclosure.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The generated client uses `Headers.entries()`, so the client library TypeScript config must include `dom.iterable`.
- The fixture state is process-local and resets when the API workflow restarts; this is intentional for deterministic demonstration behavior.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
