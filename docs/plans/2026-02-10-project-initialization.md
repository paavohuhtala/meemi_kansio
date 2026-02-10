# Project Initialization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the git repo, Rust backend with Axum, React + TypeScript frontend, PostgreSQL via Docker Compose, and verify everything builds and connects.

**Architecture:** Monorepo with `backend/` (Rust/Axum) and `frontend/` (React/Vite). PostgreSQL runs in Docker. Backend serves API on port 3000, frontend dev server on port 5173 with proxy to backend.

**Tech Stack:** Rust 1.92, Axum, sqlx, PostgreSQL 16, React 19, TypeScript, Vite, styled-components, pnpm, Docker Compose

---

### Task 1: Initialize Git Repo

**Files:**
- Create: `.gitignore`

**Step 1: Initialize git**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git init
```

**Step 2: Create .gitignore**

```gitignore
# Rust
backend/target/

# Node
frontend/node_modules/
frontend/dist/

# Environment
.env
.env.local

# OS
.DS_Store

# Data
uploads/
```

**Step 3: Commit**

```bash
git add .gitignore docs/
git commit -m "init: project skeleton with design docs"
```

---

### Task 2: Initialize Rust Backend

**Files:**
- Create: `backend/Cargo.toml`
- Create: `backend/src/main.rs`
- Create: `backend/src/config.rs`

**Step 1: Create Cargo project**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
cargo init backend
```

**Step 2: Add dependencies to `backend/Cargo.toml`**

```toml
[package]
name = "meemi-backend"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
dotenvy = "0.15"
```

**Step 3: Write `backend/src/config.rs`**

```rust
use std::env;

pub struct Config {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub upload_dir: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://meemi:meemi@localhost:5432/meemi".to_string()),
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            upload_dir: env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string()),
        }
    }
}
```

**Step 4: Write `backend/src/main.rs`**

```rust
mod config;

use axum::{routing::get, Json, Router};
use config::Config;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = Config::from_env();

    let app = Router::new()
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**Step 5: Verify it compiles**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/backend
cargo check
```

Expected: compiles with no errors.

**Step 6: Commit**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git add backend/
git commit -m "feat: initialize Rust backend with Axum and health endpoint"
```

---

### Task 3: Set Up Docker Compose with PostgreSQL

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/.env`

**Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: meemi
      POSTGRES_PASSWORD: meemi
      POSTGRES_DB: meemi
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**Step 2: Write `backend/.env`**

```env
DATABASE_URL=postgres://meemi:meemi@localhost:5432/meemi
HOST=0.0.0.0
PORT=3000
UPLOAD_DIR=./uploads
```

**Step 3: Start PostgreSQL**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
docker compose up -d db
```

Expected: PostgreSQL container running on port 5432.

**Step 4: Verify connection**

```bash
docker compose exec db psql -U meemi -c "SELECT 1"
```

Expected: returns `1`.

**Step 5: Commit**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git add docker-compose.yml
git commit -m "infra: add Docker Compose with PostgreSQL"
```

Note: `backend/.env` is gitignored.

---

### Task 4: Set Up sqlx and Database Migrations

**Files:**
- Create: `backend/migrations/0001_initial.sql`

**Step 1: Install sqlx-cli**

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

**Step 2: Create initial migration**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/backend
sqlx migrate add -r initial
```

This creates `migrations/<timestamp>_initial.up.sql` and `migrations/<timestamp>_initial.down.sql`.

**Step 3: Write the up migration**

```sql
-- Up migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE media_type AS ENUM ('image', 'video', 'gif');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id),
    used_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    description TEXT,
    media_type media_type NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    source_url TEXT,
    thumbnail_path TEXT,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_tags (
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, tag_id)
);

CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_media_created_at ON media(created_at DESC);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_invites_code ON invites(code);
```

**Step 4: Write the down migration**

```sql
-- Down migration
DROP TABLE IF EXISTS media_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS media_type;
DROP TYPE IF EXISTS user_role;
```

**Step 5: Run migrations**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/backend
sqlx migrate run
```

Expected: migration applied successfully.

**Step 6: Verify tables exist**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
docker compose exec db psql -U meemi -c "\dt"
```

Expected: lists users, invites, media, tags, media_tags tables.

**Step 7: Add database pool to main.rs**

Update `backend/src/main.rs` to connect to the database on startup:

```rust
mod config;

use axum::{extract::State, routing::get, Json, Router};
use config::Config;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let row: (i32,) = sqlx::query_as("SELECT 1").fetch_one(&state.db).await.unwrap();
    Json(serde_json::json!({ "status": "ok", "db": row.0 == 1 }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = Config::from_env();

    let db = PgPool::connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!()
        .run(&db)
        .await
        .expect("failed to run migrations");

    let state = AppState { db };

    let app = Router::new()
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**Step 8: Verify it compiles and health endpoint works**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/backend
cargo run &
# Wait a few seconds for startup
curl http://localhost:3000/api/health
# Kill the server
kill %1
```

Expected: `{"status":"ok","db":true}`

**Step 9: Commit**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git add backend/migrations/ backend/src/
git commit -m "feat: add sqlx migrations and database connection"
```

---

### Task 5: Initialize React Frontend

**Files:**
- Create: `frontend/` (via Vite scaffold)

**Step 1: Scaffold Vite + React + TypeScript**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
pnpm create vite frontend --template react-ts
```

**Step 2: Install dependencies**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/frontend
pnpm install
```

**Step 3: Install additional dependencies**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/frontend
pnpm add styled-components @tanstack/react-query react-router-dom
pnpm add -D @types/styled-components
```

**Step 4: Verify dev server starts**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/frontend
pnpm dev &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML response from Vite dev server.

**Step 5: Commit**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git add frontend/
git commit -m "feat: initialize React + TypeScript frontend with Vite"
```

---

### Task 6: Set Up Frontend Theme and Project Structure

**Files:**
- Create: `frontend/src/styles/theme.ts`
- Create: `frontend/src/styles/global.ts`
- Create: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/vite.config.ts`
- Delete: `frontend/src/App.css`, `frontend/src/index.css`

**Step 1: Write `frontend/src/styles/theme.ts`**

```typescript
export const theme = {
  colors: {
    bg: '#0f0f0f',
    surface: '#1a1a1a',
    surfaceHover: '#252525',
    border: '#333333',
    text: '#e0e0e0',
    textSecondary: '#888888',
    primary: '#6366f1',
    primaryHover: '#818cf8',
    error: '#ef4444',
    success: '#22c55e',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  fontSize: {
    sm: '0.875rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    xxl: '2rem',
  },
} as const;

export type Theme = typeof theme;

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const media = {
  sm: `@media (min-width: ${breakpoints.sm}px)`,
  md: `@media (min-width: ${breakpoints.md}px)`,
  lg: `@media (min-width: ${breakpoints.lg}px)`,
  xl: `@media (min-width: ${breakpoints.xl}px)`,
} as const;
```

**Step 2: Write `frontend/src/styles/global.ts`**

```typescript
import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    line-height: 1.5;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
  }
`;
```

**Step 3: Write `frontend/src/api/client.ts`**

```typescript
const API_BASE = '/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
```

**Step 4: Configure Vite proxy in `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**Step 5: Update `frontend/src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import { theme } from './styles/theme';
import { GlobalStyle } from './styles/global';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <div>
          <h1>meemi</h1>
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
```

**Step 6: Update `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 7: Delete unused CSS files**

```bash
rm frontend/src/App.css frontend/src/index.css
```

**Step 8: Add styled-components type declaration**

Create `frontend/src/styled.d.ts`:

```typescript
import 'styled-components';
import type { Theme } from './styles/theme';

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
```

**Step 9: Verify frontend builds**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/frontend
pnpm build
```

Expected: builds with no errors.

**Step 10: Commit**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
git add frontend/
git commit -m "feat: set up frontend theme, API client, and project structure"
```

---

### Task 7: End-to-End Smoke Test

**Step 1: Start PostgreSQL**

```bash
cd /Users/paavohtl/koodia/meemi_kansio
docker compose up -d db
```

**Step 2: Start backend**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/backend
cargo run &
```

**Step 3: Start frontend**

```bash
cd /Users/paavohtl/koodia/meemi_kansio/frontend
pnpm dev &
```

**Step 4: Verify health endpoint through Vite proxy**

```bash
curl http://localhost:5173/api/health
```

Expected: `{"status":"ok","db":true}`

**Step 5: Clean up**

```bash
kill %1 %2
docker compose down
```
