# Unified Upload Preview Grid

## Context

The upload page currently shows a preview only for single-file uploads. Multi-file uploads show a filename list, then switch to a separate results grid after uploading. Single uploads auto-navigate away. The user wants a unified experience: per-file previews visible across selection, upload, and results phases, with the ability to remove, replace, or add files at any point.

## Design

### Component structure

```
UploadPage
  ├── DropZone          (only when no files selected — existing component, unchanged)
  └── FilePreviewGrid   (new component, shown when files.length > 0)
       ├── FileCard × N
       │    ├── Local blob preview (image or video poster)
       │    ├── Status overlay: idle | uploading | success | error
       │    ├── Remove/dismiss (×) button (all states except uploading)
       │    └── Replace: drag-drop onto card or click to open picker
       └── AddFileCard   (mini drop zone: click / drop / paste to add more)
```

### FileCard states

| State | Visual | Actions |
|-------|--------|---------|
| **Selected** | Preview + filename | Remove (×), replace (drop/click) |
| **Uploading** | Dimmed preview + spinner | None (in progress) |
| **Success** | Preview + success indicator | Click → `/media/{id}` (new tab), dismiss (×) |
| **Error** | Preview + error text | Retry button, dismiss (×) |

### Upload flow

- Upload button fires all pending files concurrently (same as current bulk)
- No auto-navigate — results appear in-place on cards
- Successfully uploaded files stay in grid until dismissed
- New files can be added at any time via AddFileCard
- Upload button re-appears whenever there are pending (un-uploaded) files

### Files to modify

1. **`frontend/src/components/FilePreviewGrid.tsx`** (new) — grid + FileCard + AddFileCard
2. **`frontend/src/pages/UploadPage.tsx`** — replace DropZone/results grid split with unified flow using FilePreviewGrid
3. **`frontend/src/components/index.ts`** — export FilePreviewGrid
4. **`frontend/src/components/DropZone.tsx`** — no changes needed (used for empty state only)

### State management (in UploadPage)

```typescript
interface FileEntry {
  id: string;          // stable key (crypto.randomUUID())
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  media?: MediaItem;   // set on success
  error?: string;      // set on error
}
```

- `entries: FileEntry[]` — single source of truth
- Adding files appends entries with `status: 'pending'`
- Replacing a file swaps the File object and resets status to `pending`
- Remove/dismiss splices the entry out
- Upload button filters entries with `status === 'pending'` and fires them

### AddFileCard behavior

- Styled like a dashed-border card with upload icon + "Add files" text
- Click → opens multi-file picker
- Drag-drop files onto it → appends to entries
- Deduplication by `name:size` (reuse existing `dedupeFiles` logic from DropZone)

### Page-level paste handler

- UploadPage registers a `paste` event listener on the document
- Pasted files are appended to entries (deduplicated), regardless of focus
- Works in both empty state (populates from DropZone) and grid state (appends)

### Preview rendering

- Images: `URL.createObjectURL(file)` as `<img>` background
- Videos: `URL.createObjectURL(file)` with `<video>` element (no controls, muted, shows poster frame)
- Cleanup: revoke blob URLs when entries are removed or component unmounts
