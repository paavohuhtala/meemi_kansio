# Tagging & Filtering

Organizational tagging system for categorizing and filtering media. Users tag media on upload or later on the detail page. The browse page supports filtering by tags via clickable chips and a filter bar.

## Database

The `tags` and `media_tags` tables already exist (initial migration). No new migration needed.

- `tags(id UUID, name TEXT UNIQUE)` — tag definitions
- `media_tags(media_id UUID, tag_id UUID)` — join table, cascade delete on both FKs

## Tag naming rules

- Trimmed and lowercased
- 1-30 characters
- Any non-whitespace Unicode characters allowed (letters, numbers, hyphens, accents, emoji, etc.)
- Backend validates and rejects invalid names with 400

## Backend API

### New endpoints

**`GET /api/tags?q=<prefix>`** — Autocomplete search. Returns `{ tags: [{ id, name }] }`, limit 10. Empty `q` returns most-used tags (by media count).

**`PUT /api/media/:id/tags`** — Replace all tags on a media item. Body: `{ tags: ["cats", "cursed"] }`. Inserts new tag names into `tags` table, replaces `media_tags` rows. Single transaction.

### Modified endpoints

**`POST /api/media/upload`** — Accept optional `tags` field (JSON string array in multipart form). Tags created and linked in the same transaction as the upload.

**`GET /api/media`** — Accept optional `tags` query param: `?tags=cats,cursed`. Returns only media with all specified tags (AND logic). Joins through `media_tags` with `HAVING COUNT = N`. Cursor pagination unchanged. Each item in response includes `tags: string[]`.

**`GET /api/media/:id`** — Response includes `tags: string[]`.

## Frontend

### TagInput component

Shared component for upload page, detail page edit mode, and browse page filter bar.

Props:
- `tags: string[]` — current tags
- `onChange: (tags: string[]) => void` — called when tags change
- `placeholder?: string`

Behavior:
- Current tags rendered as removable chips (pill with "x" button)
- Text input at the end for typing new tags
- Autocomplete dropdown on typing (debounced ~200ms, fetches `GET /api/tags?q=...`)
- Dropdown styled like existing DropdownMenu (dark surface, highlighted item)
- Enter or click suggestion to add tag
- Tags normalized on input: lowercased, trimmed, no duplicates
- The component manages autocomplete state internally; parent controls `tags`

### Upload page

TagInput below the description field. Tags stored as local state, sent as JSON string in multipart form data.

### Media detail page

Tags shown as clickable chips below title/description. Each chip links to `/?tags=<tag>` on the browse page.

In edit mode (triggered by existing Edit button), TagInput appears alongside name/description fields. Saving calls `PUT /api/media/:id/tags` alongside the existing `PATCH` for name/description.

### Browse page

**Filter bar** above the grid. Shows active tag filters as removable chips plus a TagInput for adding filters. Active tags read from/written to URL query string (`?tags=cats,cursed`) via `useSearchParams`. Changing tags resets the infinite scroll cursor and re-fetches.

**Tag chips on cards.** Each grid card shows its tags at the bottom (small, subtle). Clicking a tag chip adds it to the active filter URL.

React Query key includes tags: `['media-list', { tags }]`.

### Frontend API

- `searchTags(query: string): Promise<{ tags: Tag[] }>` — autocomplete
- `setMediaTags(id: string, tags: string[]): Promise<void>` — replace tags
- `listMedia(cursor?, tags?: string[])` — add optional tags filter
- `uploadMedia(file, name?, description?, tags?: string[])` — add optional tags
- `MediaItem` type gains `tags: string[]` field

## Cleanup and constraints

- Orphan tags left in `tags` table (useful for autocomplete of previously used tags)
- `media_tags` cascade delete handles media deletion
- No hard limit on tags per item

## E2E tests

- Upload with tags, verify they appear on detail page
- Edit tags on detail page, verify update persists
- Filter browse page by tag, verify only matching items shown
- Click tag chip on card, verify filter activates
- Multi-tag AND filter
- Autocomplete shows existing tags
