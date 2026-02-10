# Media Organizer — Design Document

Multi-user web platform for uploading, organizing, and searching memes, images, and videos. Invite-based access for small communities.

## Tech Stack

- **Backend:** Rust + Axum, sqlx for PostgreSQL
- **Frontend:** React + TypeScript, styled-components, Vite
- **Database:** PostgreSQL
- **File storage:** Local filesystem with abstracted storage trait (swap to S3 later)
- **Auth:** Argon2id password hashing, invite-based registration
- **Deployment:** Docker Compose (self-hosted), cloud-optional

## Data Model

### users
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| username | text | unique |
| password_hash | text | argon2id, salt embedded |
| role | enum | admin, member |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### invites
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| code | text | unique, random |
| created_by | UUID | FK -> users |
| used_by | UUID | FK -> users, nullable |
| expires_at | timestamptz | |
| created_at | timestamptz | |

### media
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | text | optional |
| description | text | optional |
| media_type | enum | image, video, gif |
| file_path | text | location in storage layer |
| file_size | bigint | |
| mime_type | text | |
| source_url | text | nullable, set when imported via URL |
| thumbnail_path | text | for previews |
| uploaded_by | UUID | FK -> users |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### tags
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | text | unique, lowercase, normalized |
| created_at | timestamptz | |

### media_tags
| Column | Type | Notes |
|---|---|---|
| media_id | UUID | FK -> media |
| tag_id | UUID | FK -> tags |
| | | PK on (media_id, tag_id) |

Tags are global — shared across all users.

## API Endpoints

### Auth
- `POST /api/auth/register` — sign up with invite code
- `POST /api/auth/login` — returns session token
- `POST /api/auth/logout`

### Invites (admin only)
- `POST /api/invites` — create invite link
- `GET /api/invites` — list invites and status

### Media
- `POST /api/media/upload` — multipart file upload with optional name, description, tags
- `POST /api/media/import` — import from URL with optional metadata
- `GET /api/media` — list/search, query params for tags, text search, pagination
- `GET /api/media/:id` — single item with full metadata
- `PATCH /api/media/:id` — update name, description, tags
- `DELETE /api/media/:id` — remove (admin or uploader)

### Tags
- `GET /api/tags` — list all tags with optional usage counts
- `GET /api/tags/:name/media` — all media with a given tag

### Files
- `GET /api/files/:path` — serve media file from storage
- `GET /api/files/thumb/:path` — serve thumbnail

## Frontend

### Pages
- **Login / Register** — simple forms, register requires invite code
- **Browse** — grid of thumbnails, infinite scroll or pagination, tag filter bar, text search
- **Upload** — drag & drop + URL import, inline name/description/tags
- **Media detail** — full-size view, metadata, editable tags, edit/delete controls
- **Admin panel** — manage invites and users

### Styling & State
- styled-components with shared theme module (`src/styles/theme.ts`) for colors, spacing, breakpoints, media query helpers
- TanStack Query for server state (caching, pagination, refetching)
- Minimal client state: auth token + active filters

### Thumbnails
- Generated server-side on upload
- `image` crate for images, `ffmpeg` subprocess for video

## Project Structure

```
meemi_kansio/
├── backend/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── config.rs
│   │   ├── routes/
│   │   ├── models/
│   │   ├── storage/       # storage trait + local impl
│   │   ├── auth/
│   │   └── services/      # import, thumbnails
│   └── migrations/
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       ├── styles/
│       │   └── theme.ts
│       └── hooks/
├── docker-compose.yml
├── Dockerfile
└── docs/
    └── plans/
```

## Future Considerations (not in initial build)

- OCR for text extraction from images
- Full-text / fuzzy search (Meilisearch or similar)
- S3-compatible storage backend
- Semantic/visual search with embeddings
