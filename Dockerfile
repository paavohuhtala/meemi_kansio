# Stage 1: Build frontend
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# Stage 2: Build backend
FROM rust:1.93.1-bookworm AS backend-build
WORKDIR /app

# Install system deps for ocr-rs (MNN C++ build)
RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    libclang-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY backend/Cargo.toml backend/Cargo.lock ./backend/
COPY vendor/ ./vendor/

# Create a dummy main.rs to build dependencies
RUN mkdir -p backend/src && \
    echo "fn main() {}" > backend/src/main.rs && \
    mkdir -p backend/migrations

# Copy migrations (needed at compile time for sqlx::migrate!())
COPY backend/migrations/ ./backend/migrations/

# Build dependencies only (cached layer)
RUN cd backend && cargo build --release 2>/dev/null || true

# Now copy actual source and build
COPY backend/src/ ./backend/src/
RUN touch backend/src/main.rs && cd backend && cargo build --release

# Stage 3: Runtime
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy backend binary
COPY --from=backend-build /app/backend/target/release/meemi-backend /app/meemi-backend

# Copy frontend static files
COPY --from=frontend-build /app/frontend/dist /app/static

# Copy OCR models
COPY backend/models/ /app/models/

ENV STATIC_DIR=/app/static
ENV MODEL_DIR=/app/models
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["/app/meemi-backend"]
