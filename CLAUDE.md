# Project Guidelines

## Architecture

meemi_kansio is a media sharing app with a Rust backend and React frontend.

- **Backend**: Rust with Axum, PostgreSQL via sqlx, JWT auth with cookie transport
- **Frontend**: React 19, TypeScript, Vite, styled-components, React Router, React Query
- **E2E tests**: Playwright (lives in `frontend/e2e/`)
- **Database migrations**: sqlx (`backend/migrations/`)

### Project Structure

```
backend/src/
  auth/          # JWT middleware, login/register handlers
  models/        # sqlx FromRow structs + response types
  routes/        # Axum route handlers grouped by domain
  config.rs      # Env-based configuration
  error.rs       # AppError enum -> HTTP responses

frontend/src/
  api/           # API client + per-domain fetch functions
  components/    # Shared UI components (Layout, primitives)
  hooks/         # React hooks (useAuth, etc.)
  pages/         # Route-level page components
  styles/        # Theme + global styles

frontend/e2e/
  pom/           # Page Object Model classes
  tests/         # Test files
  fixtures.ts    # Playwright fixtures wiring POMs
  helpers.ts     # DB reset, server URL helpers
  test-server.ts # Manages backend instances for tests
```

## Package Management

- Use **pnpm** for Node.js dependencies
- Never use `npx` — use `pnpm exec` for installed dependencies, or `pnpm dlx` for temporary ones.

## Development

- Run `./dev.sh` to start frontend + backend in a tmux session
- Frontend dev server: `pnpm dev` (from `frontend/`)
- Backend watch mode: `bacon run` (from `backend/`, globally installed)
- Docker Compose provides the dev PostgreSQL instance

## Development Approach

- Build features as **end-to-end vertical slices**: database migration, backend model + route, frontend API client + page, and e2e tests — all in one pass.
- Keep backend and frontend changes in sync. A new API endpoint should ship with its frontend consumer.

## E2E Testing

- Before the tests can be run, start the test database (which runs using Docker Compose): `pnpm test:db:start`
- Run tests: `pnpm test:e2e` (from `frontend/`)
- Use the **Page Object Model (POM)** pattern for all page interactions:
  - Page objects live in `frontend/e2e/pom/` — one class per page/component
  - Locators are declared as `readonly` fields, initialized in the constructor
  - Action methods (login, register, upload) encapsulate multi-step workflows
  - POMs are injected via Playwright fixtures in `fixtures.ts`
- Import `e2eTest` and `expect` from `fixtures.ts`, not from `@playwright/test`
- Each test gets a fresh database (reset in the `page` fixture teardown)
- Test data files live in `test_data/`
- Avoid TypeScript parameter properties (`private readonly x: X` in constructor params) — the tsconfig has `erasableSyntaxOnly` enabled. Declare fields explicitly and assign in the constructor body.

## Backend Conventions

- All route handlers return `Result<Json<T>, AppError>`
- `AppError` maps to HTTP status codes and logs automatically (warn for 4xx, error for 5xx)
- Use `sqlx::query_as` with `FromRow` structs for database queries
- Separate internal models from API response types (e.g., `Media` vs `MediaResponse`)

## Frontend Conventions

- Use styled-components for styling — follow the existing theme tokens
- API functions go in `frontend/src/api/` with one file per domain
- Use `apiFetch<T>` / `apiFetchFormData<T>` from `api/client.ts` for API calls
- Radix Primitives for interactive UI components (dropdowns, dialogs, etc.)
