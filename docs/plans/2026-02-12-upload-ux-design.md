# Upload UX Improvements Design

**Goal:** Add file preview, drag-and-drop, and clipboard paste support to the upload flow — both on the upload page itself and as a shortcut from any other page.

## Architecture

Three new pieces:

1. **`DropZone` component** — Handles file selection (click, drag, paste) and preview display. Used on the upload page.
2. **`useGlobalFileDrop` hook** — Handles drag-and-drop and paste on all pages except `/upload`. Navigates to the upload page with the file in router state.
3. **Upload page integration** — Replaces the bare file input with DropZone, reads `location.state.file` on mount to support the global drop/paste flow.

## DropZone Component

**Props:** `value: File | null`, `onChange: (file: File) => void`, `accept: string[]` (MIME types).

**Visual states:**

- **Empty:** Dashed-border box with icon and "Drop file here, paste, or click to browse" text. Muted styling.
- **Drag hover:** Border and background highlight in primary color at low opacity.
- **Image selected:** `<img>` preview via `URL.createObjectURL()`. A small overlay button to change the file.
- **Video selected:** `<video controls>` preview via `URL.createObjectURL()`. Same change button.

**Input methods:**

- **Click:** Triggers a hidden `<input type="file">`.
- **Drag & drop:** `onDragOver`/`onDrop` on the container.
- **Paste:** `onPaste` on the container (uses `tabIndex={0}` for focusability).

Object URLs are revoked in a `useEffect` cleanup to avoid memory leaks.

Invalid file types are silently ignored (the browser file picker already filters by `accept`).

## Upload Page Changes

- Replace the `<input type="file">` with `<DropZone value={file} onChange={setFile} />` at the top of the form.
- On mount, read `location.state?.file` and call `setFile()` if present. This prefills the preview when arriving from a global drop/paste.
- Name, description, and tag fields remain unchanged below the DropZone.
- Paste listener is scoped to the DropZone container, so it doesn't interfere with typing in text fields.
- No changes to form submission — `file` state is already a `File` object.

## Global Drop & Paste Hook

`useGlobalFileDrop(acceptedTypes: string[])` — used in the `Layout` component (wraps all protected routes). Disabled when on `/upload` (DropZone handles it there).

**Drop handling:**

- Document-level `dragenter`/`dragleave`/`dragover`/`drop` listeners.
- `dragenter` with a file: sets `isDragging = true`, renders a full-page fixed overlay with translucent background and "Drop to upload" centered text.
- `drop`: extracts file, navigates to `/upload` with `{ state: { file } }`.
- `dragleave` counter pattern: increment on `dragenter`, decrement on `dragleave`, hide overlay at 0. This avoids false dismissals when dragging over child elements.

**Paste handling:**

- Document-level `paste` listener.
- If `clipboardData.files` contains an accepted file type and the active element is not a text input/textarea, navigates to `/upload` with the file.

## E2E Testing

**POM updates:**

- `UploadPage`: add `preview` locator (the preview img/video inside drop zone). Existing `fileInput` locator and `upload()` method remain unchanged — the hidden input still exists.

**New tests:**

- Upload page shows image preview after file selection.
- Upload page shows video preview after file selection.
- Dropping file on browse page navigates to upload with preview.
- Pasting file on browse page navigates to upload with preview.

Existing upload/tag tests are unaffected since form fields and submission are unchanged.
