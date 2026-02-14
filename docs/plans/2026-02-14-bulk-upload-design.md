# Bulk Upload Design

## Summary

Extend the existing single-file upload flow to support selecting and uploading multiple files concurrently. No backend changes required; each file is a separate `POST /api/media/upload`.

## Approach

Evolve `UploadPage` to handle `File[]`. When 2+ files are selected the page enters bulk mode with a different button label, concurrent uploads, and a results grid. Single-file upload (1 file selected) preserves current auto-navigate behavior.

## State Model

```ts
type UploadStatus =
  | { status: 'pending' }
  | { status: 'uploading' }
  | { status: 'success'; media: MediaItem }
  | { status: 'error'; error: string };

interface BulkEntry {
  file: File;
  result: UploadStatus;
}
```

The page tracks `File[]` during selection. On submit, each file becomes a `BulkEntry` and all uploads fire concurrently via individual `uploadMedia()` calls.

## DropZone Changes

Discriminated union props for backwards compatibility:

```ts
// Single mode (existing callers unchanged)
{ multiple?: false; value: File | null; onChange: (file: File) => void }
// Multi mode
{ multiple: true; value: File[]; onChange: (files: File[]) => void }
```

- Hidden input gets the `multiple` attribute when in multi mode.
- Drag, drop, and paste collect all files instead of just `[0]`.
- Multi-mode preview: show file count + file list (no thumbnails).
- Adding more files appends to the selection, deduped by name+size.
- Overlay text: "Drop to add more files" when files already selected.

## UploadPage Phases

### Phase 1 - Selection

- DropZone always in `multiple` mode.
- 1 file: single-file preview in DropZone, button says "Upload".
- 2+ files: DropZone shows count and file list, button says "Upload N files".
- User can keep adding files via drop/click/paste.

### Phase 2 - Uploading

- DropZone replaced by results grid of thumbnail-sized cards.
- Each card: filename + status (spinner while uploading, thumbnail on success, error icon on failure).
- Button area shows progress: "Uploaded 3 / 5".

### Phase 3 - Done

- Results grid stays. Successful cards are clickable (navigate to `/media/{id}`).
- Failed cards show a retry button.
- "Upload more" button resets to Phase 1.
- Single file (1 file selected): auto-navigates to media page on success, same as today.

## Global Drop Handler

- `useGlobalFileDrop` collects all files from `dataTransfer.files` (filtered by type), not just `[0]`.
- Passes `{ files: File[] }` in location state.
- `UploadPage` reads `location.state.files`.
- Paste remains single-file.

## File Naming

Files are auto-named from their filename (minus extension), same as single upload does today. No per-file naming UI.

## Error Handling

- All files upload concurrently. Failures do not stop other uploads.
- Per-file status shown in results grid.
- Failed files can be retried individually.

## No Concurrency Limit

All files upload in parallel. The 50MB per-file backend limit is sufficient natural throttle.

## E2E Tests

Simulate failures with `page.route()` interception. All assertions target final settled state, not transient loading indicators.

- **Bulk upload success**: select 3 files, upload, assert 3 clickable thumbnails in results grid linking to `/media/{id}`.
- **Partial failure**: select 2 files, intercept to fail one, assert 1 thumbnail + 1 error card with retry button.
- **Retry**: from partial failure, click retry (remove intercept), assert both show thumbnails.
- **Results navigation**: click thumbnail in results, assert navigated to `/media/{id}`.
- **Upload more reset**: click "Upload more", assert DropZone back in selection state.
- **Single file preserves redirect**: select 1 file, upload, assert auto-navigated to `/media/{id}`.
- **Global multi-drop**: drop 3 files on gallery page, assert upload page shows 3 files selected.
