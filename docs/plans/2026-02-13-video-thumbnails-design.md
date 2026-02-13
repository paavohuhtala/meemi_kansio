# Video Thumbnails Design

## Overview

Add thumbnail generation for video uploads using FFmpeg. Videos currently show as `<video>` elements in the gallery with `preload="metadata"`, which is slow and bandwidth-heavy. With this feature, videos get a gallery thumbnail (`_thumb.webp`) just like images and GIFs.

## Approach

- **System FFmpeg** — shell out to `ffmpeg` and `ffprobe` CLI tools (must be on PATH)
- **Frame at 1 second** — extract a single frame at the 1-second mark, fall back to 0s for short videos
- **Gallery thumb only** — no clipboard PNG for videos (only `_thumb.webp`)
- **Reuse existing pipeline** — FFmpeg extracts a raw PNG frame, then the existing `image` crate + Lanczos3 resize produces the WebP thumbnail
- **Async I/O** — use `tokio::process::Command` for ffmpeg/ffprobe (non-blocking), `spawn_blocking` for CPU-bound image resize
- **Best-effort** — failures logged as warnings, uploads succeed without thumbnails

## Video Dimension Extraction

Also extract video width/height via `ffprobe` during upload. Currently videos have `None` for dimensions, preventing proper aspect ratio calculation in the gallery grid.

## Backend Changes

### New module: `video.rs`

- `extract_frame(path) -> Result<Vec<u8>>` — runs ffmpeg, returns PNG bytes
- `probe_dimensions(path) -> Result<(i32, i32)>` — runs ffprobe, returns (width, height)

### Modified: `thumbnails.rs`

New function `generate_gallery_thumb()` — produces only `_thumb.webp`, reusing `resize_to_max()`.

### Modified: upload/replace handlers

For videos: probe dimensions, extract frame, generate gallery thumb. Same best-effort pattern as images.

### Modified: `MediaResponse::into_response()`

Videos now return `thumbnail_url: Some(...)` instead of `None`. `clipboard_url` stays `None`.

## Frontend Changes

### Gallery (`HomePage.tsx`)

Override both `file_url` and `media_type` when thumbnail is available, so videos render as `<img>` in the gallery grid. Play icon overlay still works (uses original `item.media_type`).

## Error Handling

- FFmpeg not on PATH: warning logged, upload succeeds without thumbnail
- Frame extraction fails: warning logged, no thumbnail
- ffprobe fails: warning logged, dimensions stay `None`
- Video shorter than 1s: fallback to first frame (`-ss 0`)
