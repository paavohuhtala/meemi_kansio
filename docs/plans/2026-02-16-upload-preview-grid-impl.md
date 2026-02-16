# Upload Preview Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the upload page's separate selection/results phases with a unified preview grid showing per-file thumbnails across all upload lifecycle stages.

**Architecture:** New `FilePreviewGrid` component renders a CSS grid of `FileCard`s (one per file) + an `AddFileCard`. `UploadPage` manages `FileEntry[]` state and passes callbacks. `DropZone` is only used for the initial empty state. Page-level paste handler appends files regardless of focus.

**Tech Stack:** React 19, styled-components, Radix icons, Playwright e2e

---

### Task 1: Create FilePreviewGrid component

**Files:**
- Create: `frontend/src/components/FilePreviewGrid.tsx`

**Step 1: Create the component with types and grid layout**

```tsx
// frontend/src/components/FilePreviewGrid.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Cross2Icon, ReloadIcon, UploadIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import styled, { css, keyframes } from 'styled-components';
import type { MediaItem } from '../api/media';

export interface FileEntry {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  media?: MediaItem;
  error?: string;
}

interface FilePreviewGridProps {
  entries: FileEntry[];
  accept: string[];
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onAdd: (files: File[]) => void;
  onRetry: (id: string) => void;
}
```

The grid uses `repeat(auto-fill, minmax(150px, 1fr))` matching the existing `ResultsGrid` dimensions.

**Step 2: Implement FileCard with blob preview**

Each `FileCard` creates a blob URL via `useMemo` for the preview, and revokes it on unmount. Cards show:
- Image: `<img>` with `object-fit: cover` and `aspect-ratio: 1`
- Video: `<video>` element, muted, no controls (just shows the first frame as poster)

**Step 3: Implement status overlays**

- `pending`: no overlay, filename at bottom, × button top-right. Click opens file picker to replace. Drop replaces.
- `uploading`: semi-transparent dark overlay with CSS spinning animation
- `success`: green checkmark badge. Card wrapped in `<a href="/media/{id}" target="_blank">`. × button to dismiss.
- `error`: red overlay with error text + retry button. × button to dismiss.

**Step 4: Implement AddFileCard**

A card-sized dashed-border box with UploadIcon + "Add files" text. Has a hidden `<input type="file" multiple>`. Supports click (opens picker) and drag-drop (appends files). Filtered by `accept` prop.

**Step 5: Implement drag-drop replace on FileCards**

Each `FileCard` in `pending` or `error` status accepts drag-drop. On drop, calls `onReplace(id, file)` with the first accepted file.

**Step 6: Run type check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```
git add frontend/src/components/FilePreviewGrid.tsx
git commit -m "feat: add FilePreviewGrid component"
```

---

### Task 2: Export FilePreviewGrid from components index

**Files:**
- Modify: `frontend/src/components/index.ts`

**Step 1: Add the export**

Add to the end of `frontend/src/components/index.ts`:
```ts
export { FilePreviewGrid, type FileEntry } from './FilePreviewGrid';
```

**Step 2: Commit**

```
git add frontend/src/components/index.ts
git commit -m "feat: export FilePreviewGrid from components"
```

---

### Task 3: Rewrite UploadPage to use FilePreviewGrid

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

**Step 1: Replace UploadPage implementation**

Key changes:
- State: `entries: FileEntry[]` replaces both `files` and `entries/BulkEntry`
- Initial state: check `location.state` for pre-selected files, convert to `FileEntry[]` with `status: 'pending'`
- When `entries.length === 0`: show `DropZone` (existing, multi mode). On change, convert files to `FileEntry[]`.
- When `entries.length > 0`: show `FilePreviewGrid` + Upload button
- Upload button: filters `entries` where `status === 'pending'`, fires concurrent uploads updating each entry's status
- `handleAdd(files)`: deduplicate by `name:size` against existing entries, append new `FileEntry` objects
- `handleRemove(id)`: filter out entry by id, revoke blob URLs as needed
- `handleReplace(id, file)`: swap file, reset status to `'pending'`
- `handleRetry(id)`: re-fire upload for that entry
- Page-level paste handler: `useEffect` registering `document.addEventListener('paste', ...)` that calls `handleAdd`

Remove all old styled components that are no longer used: `ResultsGrid`, `ResultCard`, `ResultThumb`, `ResultInfo`, `ResultName`, `ResultStatus`, `ResultLink`, `ProgressText`, `Actions`.

Keep: `Container`, `Heading`, `Form`, `ErrorText`, `ACCEPTED_TYPES`, `nameFromFile`.

The Upload button text:
- `entries` has pending files: `Upload` (1 file) or `Upload N files` (N pending)
- All entries are uploading/done: button disabled or hidden
- Mix of pending + done: shows count of pending files

**Step 2: Run type check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Manual verification**

Run: `cd frontend && pnpm dev`
- Navigate to `/upload`
- Select multiple files → verify grid with previews appears
- Remove a file → card disappears
- Add more via AddFileCard → new cards appear
- Click Upload → status overlays animate
- Paste an image → appended to grid

**Step 4: Commit**

```
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: rewrite UploadPage with unified FilePreviewGrid"
```

---

### Task 4: Update UploadPage POM for new test IDs

**Files:**
- Modify: `frontend/e2e/pom/UploadPage.ts`

**Step 1: Update locators**

The new UI has different test IDs. Update the POM:
- `resultsGrid` → `previewGrid` (`data-testid="preview-grid"`)
- `resultCards` → `fileCards` (`data-testid="file-card"`)
- `uploadMoreButton` → remove (no longer exists)
- Add `addFileCard` locator (`data-testid="add-file-card"`)
- `resultCardLinks()` → update to find `<a>` elements within the preview grid that link to media pages

The `upload()` method needs updating: after submitting a single file, it no longer auto-navigates. Instead, wait for the success card to appear, then click it.

The `selectFiles()` method: the hidden input is inside the DropZone (when grid is empty) or inside the AddFileCard (when grid is showing). Use the page-level `input[type="file"]` selector — there will be at most one visible at a time.

**Step 2: Commit**

```
git add frontend/e2e/pom/UploadPage.ts
git commit -m "refactor: update UploadPage POM for preview grid"
```

---

### Task 5: Update e2e tests for new upload behavior

**Files:**
- Modify: `frontend/e2e/tests/bulk-upload.test.ts`

**Step 1: Update bulk upload tests**

Key changes:
- `resultCardLinks()` → updated in POM, should work with new selectors
- `single file upload still navigates to media page` → rewrite: upload single file, wait for success card, click to navigate
- `upload more resets to selection` → remove or rewrite: the concept of "upload more" no longer exists, replaced by AddFileCard always being present
- Update any assertions that check for `resultsGrid` to use the new `previewGrid` testid
- The success cards now open in new tabs (target="_blank"). For the "clicking result navigates" test, use `page.waitForEvent('popup')` or change the test to verify the link href instead of actually clicking.

**Step 2: Run e2e tests**

Run: `cd frontend && pnpm test:e2e --grep "bulk-upload"`
Expected: PASS

**Step 3: Also run the full upload-related test suite**

Run: `cd frontend && pnpm test:e2e`
Expected: PASS (may have failures in other tests that reference upload behavior — fix them)

**Step 4: Commit**

```
git add frontend/e2e/tests/bulk-upload.test.ts frontend/e2e/pom/UploadPage.ts
git commit -m "test: update e2e tests for unified upload preview grid"
```

---

### Task 6: Final cleanup

**Step 1: Check for any remaining references to old test IDs or removed components**

Search for: `results-grid`, `result-card`, `upload-more`, `BulkEntry`, `UploadStatus` across the codebase. Remove any dead code.

**Step 2: Run full test suite**

Run: `cd frontend && pnpm exec tsc --noEmit && pnpm test:e2e`
Expected: PASS

**Step 3: Commit any cleanup**

```
git add -A
git commit -m "chore: clean up unused upload page code"
```
