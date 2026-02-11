# Media Upload — Design

First vertical slice of media functionality: upload a file, store it, view it.

## Scope

**In scope:** file upload endpoint, local file storage, file serving, upload page, media detail page.

**Out of scope:** thumbnails, tags, storage trait abstraction, drag & drop, URL import.

## Backend

### Upload endpoint — `POST /api/media/upload`

- Accepts `multipart/form-data`: required `file` field, optional `name` and `description` text fields
- Validates MIME type against allowed list (image/jpeg, image/png, image/gif, image/webp, video/mp4, video/webm)
- Generates filename as `{uuid}.{ext}` to avoid collisions
- Writes file to `{upload_dir}/{uuid}.{ext}`, creates directory if needed
- Determines `media_type` enum from MIME (image/gif/video)
- Inserts row into `media` table, returns full media metadata as JSON

### Detail endpoint — `GET /api/media/:id`

- Returns media metadata including a constructed file URL (`/api/files/{file_path}`)
- Authenticated (any logged-in user)

### File serving — `GET /api/files/{path}`

- Serves files from `upload_dir` via tower-http `ServeDir`
- Mounted as a nested service on the router

### New files

- `backend/src/routes/media.rs` — upload + detail handlers, file serving route
- `backend/src/models/media.rs` — Media struct, MediaResponse type

### Modified files

- `backend/src/routes/mod.rs` — merge media routes
- `backend/src/models/mod.rs` — add media module

No new Cargo dependencies.

## Frontend

### Upload page — `/upload`

- File input (accept images/videos/gifs), optional name input, optional description textarea, submit button
- Loading state on button during upload
- On success: redirect to `/media/:id`
- On error: show error message inline

### Media detail page — `/media/:id`

- Fetches metadata via `GET /api/media/:id`
- Displays media file full-size (img for images/gifs, video element for videos)
- Shows name, description, uploader, upload date below the media

### API client changes

- Add `apiFetchFormData` helper that sends `FormData` without JSON content-type header

### New files

- `frontend/src/pages/UploadPage.tsx`
- `frontend/src/pages/MediaPage.tsx`
- `frontend/src/api/media.ts`

### Modified files

- `frontend/src/api/client.ts` — add FormData helper
- `frontend/src/App.tsx` — add `/upload` and `/media/:id` routes
- `frontend/src/components/Layout.tsx` — add Upload link in nav

No new npm dependencies.
