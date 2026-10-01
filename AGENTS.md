# AGENTS.md

Workspace for Spanish teachers: React SPA + .NET 9 Clean Architecture API + PostgreSQL. Stages 1–4 shipped (auth, Class Builder, Lesson Player, Student Management). Docs, specs, and README are in Spanish — keep code identifiers English, match Spanish for user-facing copy and specs.

## Environment

- Windows + PowerShell 5.1: chain with `;` and `if ($?) { ... }`, never `&&`. Scripts are `.ps1` in `scripts/`.
- Node >= 22.12; .NET SDK pinned in `global.json` (9.0.x, rollForward latestFeature).
- `Directory.Build.props` sets `TreatWarningsAsErrors=true` on all projects — any C# warning breaks the build.
- Solution file is `Profefacilisimo.slnx` (new XML format), not `.sln`.

## Setup & run

- `./scripts/Setup.ps1` — one-time: generates `.env` and `.tools/local-settings.json` (connection string + JWT key), starts Docker Postgres, restores, applies EF migrations, `npm ci`. Never hand-edit `.env` / `.tools/local-settings.json`; all scripts read settings from there.
- API: `./scripts/Start-Api.ps1` → http://localhost:5080 (sets `ConnectionStrings__Default`, `Jwt__SigningKey` itself; running `dotnet run` directly without these fails).
- Frontend: `npm --prefix frontend run dev` → http://localhost:5173, proxies `/api` to 5080 (override with `API_PROXY_TARGET`).

## Verify

- Full gate, in order: `./scripts/Test.ps1` → `dotnet test` (backend, incl. integration), `eslint`, `tsc -b && vite build`, `vitest`. CI (`.github/workflows/ci.yml`) runs Setup.ps1 → Test.ps1 → Test-E2E.ps1.
- Integration tests in `tests/Integration.Tests` need a live PostgreSQL: they read `TEST_DATABASE_CONNECTION` (set by Test.ps1) and create/drop disposable `pf_test_*` databases. Running `dotnet test` on a single project without that env var fails.
- E2E: `./scripts/Test-E2E.ps1` only — it creates a throwaway DB, boots the API on port 5081, waits for `/health/ready`, runs Playwright, then tears down. Never point E2E at the dev database or port 5080.
- Single tests: `dotnet test Profefacilisimo.slnx --filter FullyQualifiedName~Name`; `npm --prefix frontend test -- src/lessons/<file>.test.tsx`; `npm --prefix frontend run test:e2e -- <spec>`.

## Architecture

- Backend layers: `backend/Domain` (no deps) → `backend/Application` (Lessons, Students) → `backend/Infrastructure` (EF Core + `Migrations/`) → `backend/Api` (minimal-API endpoint files: `LessonEndpoints.cs`, `StudentEndpoints.cs`).
- EF migrations: `dotnet tool restore` once, then `dotnet ef database update --project backend/Infrastructure --startup-project backend/Api`.
- Frontend `frontend/src` is feature-foldered (`lessons/`, `students/`); each feature has `*-api.ts`, `*-schema.ts` (zod), and colocated `*.test.tsx` (vitest + Testing Library). API calls go through the `/api` proxy — no absolute backend URLs in code.
- Domain rule: a `Lesson` is reused across students via `LessonAssignment` (N:M); do not add `StudentId` to `Lesson`. Students use soft delete (`DeletedAt`) with a trash page.

## Specs workflow

- Feature specs live in `specs/NN-*.md`; delivered specs documented in `docs/`. Uses the repo `spec` / `spec-impl` skills; `specs/.spec-config.yml` sets `AutoCreateBranch: true` — implementation branches are named `spec-NN-slug`.
