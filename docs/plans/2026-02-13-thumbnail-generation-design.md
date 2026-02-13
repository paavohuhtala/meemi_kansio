# Thumbnail Generation Design

## Overview

Generate two thumbnail variants for every image/GIF upload to improve gallery load performance and enable fast clipboard sharing.

## Thumbnail Variants

| Variant | Max dimension | Format | Quality | Purpose |
|---------|--------------|--------|---------|---------|
| `thumb` | 400px | WebP | lossless (image crate limitation) | Gallery grid display |
| `clipboard` | 1024px | PNG | lossless | Copy-to-clipboard sharing |

## Processing Rules

- Use the `image` crate (already in Cargo.toml) with Lanczos3 filter for high-quality downscaling
- Maintain aspect ratio — scale the longest dimension to the max, the other proportionally
- Skip resizing if source is already smaller than target max dimension (still convert format)
- GIFs: decode first frame only, then treat as a static image
- Preserve alpha channel for sources with transparency (PNG, WebP)
- Videos: no thumbnails for now, but the design accommodates adding them later

## Storage

Flat alongside originals with suffix-based naming:

- Original: `uploads/{uuid}.jpg`
- Gallery thumb: `uploads/{uuid}_thumb.webp`
- Clipboard: `uploads/{uuid}_clipboard.png`

No new database columns needed — thumbnail URLs are derived from the UUID at response time.

## Backend Changes

### New module: `backend/src/thumbnails.rs`

Isolated module exposing `generate_thumbnails(source_path: &Path, uuid: &str) -> Result<(), AppError>`. Reads the source image, generates both variants, writes them to disk.

### Upload flow (`backend/src/routes/media.rs`)

After writing the original file and extracting dimensions, call `generate_thumbnails()` for image/GIF uploads. If generation fails, log a warning but still complete the upload. Same for the replace-file flow.

### Deletion

When deleting or replacing media, also delete `{uuid}_thumb.webp` and `{uuid}_clipboard.png` (best-effort).

### API response (`MediaResponse`)

Add two new fields:

```rust
pub thumbnail_url: Option<String>,  // /api/files/{uuid}_thumb.webp
pub clipboard_url: Option<String>,  // /api/files/{uuid}_clipboard.png
```

`Option` because videos won't have them. URLs are derived from `file_path` — no DB storage needed.

### Serving

No changes — `ServeDir` already serves everything in `uploads/`.

## Frontend Changes

### API types (`frontend/src/api/media.ts`)

Add `thumbnail_url: string | null` and `clipboard_url: string | null` to `MediaItem`.

### Gallery (`HomePage.tsx`)

Use `thumbnail_url` instead of `file_url` for masonry grid images. Fall back to `file_url` if null.

### Copy to clipboard (`MediaOverlay.tsx`)

When `clipboard_url` is available, fetch the pre-rendered PNG directly instead of client-side canvas conversion. Fall back to existing canvas approach if null.

### Detail page (`MediaPage.tsx`)

No changes — keeps showing the full-size original.

## Testing

- E2E tests: verify `thumbnail_url` and `clipboard_url` in API response after image upload
- E2E tests: verify thumbnail URLs are servable (GET returns 200)
- E2E tests: verify gallery renders images with thumbnail URL as src

## Approach

- Image processing: pure `image` crate (no system dependencies)
- Thumbnail generation: synchronous during upload (no background jobs)
- Naming: deterministic from UUID (no DB columns for paths)
