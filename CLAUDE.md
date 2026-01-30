# Project: study-flow-forge-91
## What this repo is
A student learning app that answers: **"What should I practice next?"**
Core loop:
- Ingest course materials (exams/slides/notes) into normalized questions
- Track attempts + mastery + spaced repetition state
- Generate **Today Plan** (capped) + **Keep Practicing** (infinite) from ONE recommendation engine
- Store all user data in Supabase with strict RLS

## Core Principle (your role)
You are the decision-maker in a modular system.
You do NOT do everything manually.
You:
1) Check blueprints
2) Use deterministic scripts
3) Handle errors intelligently
4) Make the system smarter over time (LEARNINGS.md + blueprint updates)

## System Architecture
**Blueprints (/blueprints)** — SOPs: goal, inputs, scripts, steps, edge cases
**Scripts (/scripts)** — deterministic helpers; prefer scripts over ad-hoc logic
**Workspace (/.workspace)** — temp scratch space, never commit

## Repository Map (high-signal paths)
**/src** — app source (Vite + React)
- **/src/pages** — route-level screens (Auth, Study, Progress, Admin suite)
- **/src/components** — shared UI components
- **/src/contexts** — React context providers
- **/src/hooks** — reusable hooks
- **/src/data** — seed/reference data
- **/src/integrations** — external service integrations (e.g., Supabase)
- **/src/lib** — utilities and shared logic
- **/src/types** — shared TypeScript types
- **/src/test** — test helpers/fixtures
**/supabase** — Supabase config, migrations, policies
**/public** — static assets
**/scripts** — automation helpers (see scripts/README.md)
**/blueprints** — decision-making SOPs

## How You Operate
1) Check blueprints first
2) Use existing scripts; only add new scripts when needed
3) Fail forward: Error → Fix → Test → Update blueprint → LEARNINGS.md entry
4) Repo safety: never overwrite; create *.claude.new if file exists

## Claude Skills Maintenance
- When a plan changes in a way that affects workflows or tooling, automatically update Claude skills (e.g., adjust or add skills) to keep them aligned with the latest plan.

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase
- Vitest + Playwright

## Code Standards
- TypeScript strict (no any; use unknown + narrowing)
- Explicit return types for exported functions
- Functional React components only
- Async/await over .then()
- No secrets in client code
- Client env vars via import.meta.env and VITE_ prefix only

## Supabase Security Standards
- RLS enabled on user tables
- Policies based on auth.uid()
- Service role key is scripts/server only (never shipped to client)

## What NOT To Do
- Don't skip blueprint check
- Don't overwrite existing files
- Don't disable RLS in production
- Don't introduce new architecture without a blueprint
