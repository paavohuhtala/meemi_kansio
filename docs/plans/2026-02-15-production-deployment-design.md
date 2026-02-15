# Production Deployment Design

## Overview

Deploy meemi_kansio to production using Scaleway Serverless Containers, Scaleway S3-compatible Object Storage, and Supabase PostgreSQL. Infrastructure managed with OpenTofu, deployments via GitHub Actions.

## Architecture

```
┌─────────────────┐       ┌──────────────────────────┐
│  GitHub Actions  │──────▶│ Scaleway Container       │
│  (CI/CD)         │       │ Registry                 │
└─────────────────┘       └──────────┬───────────────┘
                                     │ pull
                                     ▼
┌─────────────────┐       ┌──────────────────────────┐
│  AWS Route 53   │       │ Scaleway Serverless      │
│  meemit.        │ CNAME │ Container                │
│  mainittu.fi    │──────▶│  ┌────────────────────┐  │
└─────────────────┘       │  │ meemi-backend      │  │
                          │  │ (serves API +      │  │
                          │  │  frontend static)  │  │
                          │  └────────────────────┘  │
                          └──────────┬───────────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     ▼                               ▼
          ┌──────────────────┐            ┌──────────────────┐
          │ Supabase         │            │ Scaleway Object  │
          │ PostgreSQL       │            │ Storage (S3)     │
          │                  │            │ (public bucket)  │
          └──────────────────┘            └──────────────────┘
```

Single deployment unit: one Docker image containing the Rust backend with frontend static files baked in. The container handles API requests and serves the SPA.

### Data Flow

- Upload: user → backend → S3 bucket; database stores the S3 object key
- View: frontend constructs the public S3 URL directly (no backend proxy)
- GUID-based object keys make URLs unguessable but publicly shareable
- Backend runs database migrations on startup against Supabase PostgreSQL

## Docker Build

Multi-stage Dockerfile at project root:

### Stage 1 — Frontend build
- `node:24-alpine` base
- Install pnpm, `pnpm install --frozen-lockfile`, `pnpm build`
- Outputs `frontend/dist/`

### Stage 2 — Backend build
- `rust:1.93.1-bookworm` base
- System deps: `cmake`, `clang`, `libclang-dev`, `pkg-config`
- Enable sqlx offline mode (`SQLX_OFFLINE=true`) using committed `.sqlx/` cache
- `cargo build --release`

### Stage 3 — Runtime
- `debian:bookworm-slim` base
- Runtime deps only: `ffmpeg`, `libstdc++6`, `ca-certificates`
- Copy binary from stage 2, frontend `dist/` from stage 1, OCR models from repo
- Set `STATIC_DIR=/app/static`, expose port 3000

### Build Caching
GitHub Actions Docker layer caching via `docker/build-push-action` with registry-based `cache-from`/`cache-to`. Heavy layers (system deps, cargo deps, MNN/ocr-rs C++ build) change rarely and cache well. Standard cargo dependency pre-build pattern: copy manifests first, build deps, then copy source.

### OCR Models
Committed to git (~8.8 MB total). Keeps the build self-contained with no external download dependencies.

## S3 Integration

### Dependency
`aws-sdk-s3` in `backend/Cargo.toml`.

### Storage Trait

```rust
// backend/src/storage.rs
#[async_trait]
pub trait Storage: Send + Sync {
    async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError>;
    async fn delete(&self, key: &str) -> Result<(), AppError>;
    fn public_url(&self, key: &str) -> String;
}
```

Two implementations:
- `LocalStorage` — wraps current filesystem logic. `public_url()` returns `/api/files/{key}`. Used in development.
- `S3Storage` — uses `aws-sdk-s3`. `public_url()` returns `https://{bucket}.s3.{region}.scw.cloud/{key}`. Used in production.

### New Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `STORAGE_BACKEND` | `local` / `s3` | Selects implementation |
| `S3_BUCKET` | `meemit-media` | Bucket name |
| `S3_REGION` | `fr-par` | Scaleway region |
| `S3_ENDPOINT` | `https://s3.fr-par.scw.cloud` | S3-compatible endpoint |
| `S3_ACCESS_KEY_ID` | (secret) | Scaleway API key |
| `S3_SECRET_ACCESS_KEY` | (secret) | Scaleway secret key |

### Backend Code Changes
- `Storage` impl added to Axum app state
- Upload handler: `tokio::fs::write` → `storage.put()`
- Delete handler: `tokio::fs::remove_file` → `storage.delete()`
- Thumbnail generation: done in-memory, result written via `storage.put()`
- Video thumbnails: FFmpeg writes to temp file, read it, then `storage.put()`
- `/api/files` static route kept for local mode, unused in S3 mode

### Frontend Changes
`MediaResponse.url` field changes from a relative path (`/api/files/{uuid}.jpg`) to the full URL returned by the storage backend. Frontend already uses this field for rendering.

## OpenTofu Infrastructure

### Directory Structure
```
infra/
  main.tf          # Provider config, state backend
  containers.tf    # Serverless container + namespace
  registry.tf      # Container registry
  storage.tf       # S3 bucket for media
  state.tf         # S3 bucket for OpenTofu state (bootstrapped manually)
  dns.tf           # Route 53 CNAME record
  variables.tf     # Input variables
  outputs.tf       # Container URL, bucket endpoint, etc.
```

### Providers
- `scaleway` — container registry, serverless container, object storage bucket
- `aws` — Route 53 CNAME record for `meemit.mainittu.fi`

### State Backend
S3-compatible backend pointing at a Scaleway Object Storage bucket. This bucket is bootstrapped manually before the first `tofu apply`.

### Key Resources
- `scaleway_container_namespace` — logical grouping
- `scaleway_container` — serverless container with env vars for DB, JWT, S3. Min scale = 0, max scale = 1
- `scaleway_registry_namespace` — container registry
- `scaleway_object_bucket` — public bucket for media (ACL: public-read)
- `aws_route53_record` — CNAME from `meemit.mainittu.fi` to Scaleway container URL

### Sensitive Variables
`database_url`, `jwt_secret`, `s3_access_key_id`, `s3_secret_access_key` — all marked `sensitive = true`.

## GitHub Actions CI/CD

### `.github/workflows/ci.yml` — On push to master

1. **`test-backend`** — PostgreSQL service container, system deps (cmake, clang, ffmpeg), `cargo test`, `cargo build --release`. Upload release binary as artifact.
2. **`test-frontend`** — pnpm install, `tsc --noEmit`. Runs in parallel with test-backend.
3. **`test-e2e`** — Depends on `test-backend` and `test-frontend`. Downloads backend binary artifact. PostgreSQL service container, ffmpeg, Playwright browsers. Runs `pnpm test:e2e` against the pre-built binary.
4. **`build-and-publish`** — Depends on all test jobs. Builds Docker image, pushes to Scaleway Container Registry tagged with git SHA.
5. **`pre-release`** — Depends on `build-and-publish`. Creates a GitHub pre-release with the git SHA tag, referencing the Docker image.

### `.github/workflows/deploy.yml` — On release published

1. **`deploy`** — Installs OpenTofu, `tofu init`, `tofu apply -auto-approve` from `infra/`. Secrets injected as `TF_VAR_*` from GitHub Actions secrets. Updates the Scaleway container to the image tag from the release.

### GitHub Actions Secrets

| Secret | Purpose |
|--------|---------|
| `SCW_ACCESS_KEY` | Scaleway API access key |
| `SCW_SECRET_KEY` | Scaleway API secret key |
| `SCW_ORGANIZATION_ID` | Scaleway org ID |
| `AWS_ACCESS_KEY_ID` | Route 53 DNS management |
| `AWS_SECRET_ACCESS_KEY` | Route 53 DNS management |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | Production JWT signing key |
| `S3_ACCESS_KEY_ID` | Scaleway S3 credentials |
| `S3_SECRET_ACCESS_KEY` | Scaleway S3 credentials |

## Developer Workflow Changes

### sqlx Offline Mode
- Run `cargo sqlx prepare` after any query or migration change
- Commit the `.sqlx/` directory to git
- Docker build sets `SQLX_OFFLINE=true` to use the cache
- Forgotten `prepare` after query changes causes Docker build failure (catches mistakes)

### OCR Models
- Un-gitignore `backend/models/` and commit the three model files (~8.8 MB)

### Environment Documentation
- Add `.env.example` documenting all env vars with placeholder values
