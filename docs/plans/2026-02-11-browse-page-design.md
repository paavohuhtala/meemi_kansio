# Browse Page Design

## Overview

Replace the placeholder home page with a masonry grid of all uploaded media, sorted newest-first with cursor-based infinite scroll pagination.

## Backend

### New endpoint: `GET /api/media`

Query parameters:
- `cursor` (optional): ISO 8601 timestamp. Returns items older than this. Omit for the first page.
- `limit` (optional, default 20): items per page, capped at 50.

Response:
```json
{
  "items": [MediaResponse],
  "next_cursor": "2026-02-11T12:00:00Z" | null
}
```

Query fetches `limit + 1` rows to detect whether more pages exist, then trims the extra item. `next_cursor` is the `created_at` of the last returned item. Uses the existing `idx_media_created_at` index.

### New migration: add width/height to media

Add nullable `width` and `height` integer columns to the media table. On upload, extract image dimensions using the `image` crate (header-only read). Videos get NULL dimensions and default to 16:9 placeholders on the frontend.

Include `width` and `height` in `MediaResponse`.

## Frontend

### Data fetching

Use React Query `useInfiniteQuery` with `getNextPageParam` extracting `next_cursor`. New API function `listMedia(cursor?)` in `media.ts`.

### Masonry grid

CSS columns layout (`column-count: 3`, responsive down to 1). Each card uses `break-inside: avoid` and links to `/media/:id`.

Card contents:
- Images/GIFs: `<img>` with `loading="lazy"`, `aspect-ratio` set from width/height to prevent layout shift
- Videos: `<video>` showing poster frame (no autoplay), play icon overlay in corner. Default 16:9 aspect ratio placeholder.
- Name overlay on hover (semi-transparent gradient at bottom)

### Infinite scroll

IntersectionObserver on a sentinel div below the grid. Triggers `fetchNextPage()` when visible. Loading spinner shown while fetching.

### Empty state

Centered message with link to upload page when no media exists.

## E2E Tests

New `browse.test.ts` with BrowsePage POM:

1. Empty state shows message with upload link
2. Uploaded items appear in the grid (most recent first)
3. Clicking a grid item navigates to `/media/:id`
4. Grid renders `<img>` for images and `<video>` for videos
