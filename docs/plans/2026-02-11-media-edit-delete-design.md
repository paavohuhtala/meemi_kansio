# Media Edit & Delete Design

## Overview

Add the ability to edit media metadata, replace files, and delete media from the detail page. Any authenticated user can perform these actions.

## Backend API

### `PATCH /api/media/:id` — Update metadata

JSON body (all fields optional):
```json
{ "name": "new name", "description": "new desc" }
```
Returns updated `MediaResponse`. Sets `updated_at` to now.

### `PUT /api/media/:id/file` — Replace file

Multipart with a single `file` field. Validates mime type like the upload endpoint. Deletes the old file from disk, saves the new one, updates `file_path`, `file_size`, `mime_type`, `media_type`, `width`, `height`, and `updated_at`. Returns updated `MediaResponse`.

### `DELETE /api/media/:id` — Delete media

Hard delete. Removes the DB row and deletes the file from disk. Returns `204 No Content`.

No ownership checks — any authenticated user can edit or delete any media.

## Frontend — Media Detail Page

### Inline metadata editing

An Edit button on the detail page toggles edit mode. Title and description switch from display text to input fields pre-filled with current values. Save and Cancel buttons appear. Save calls `PATCH`, Cancel discards changes.

### File replacement

A "Replace file" button (separate from edit mode). Opens file picker, immediately uploads via `PUT /api/media/:id/file`. Loading state during upload. Media preview updates on success.

### Delete with confirmation

A Delete button opens a Radix `AlertDialog`: "Are you sure you want to delete this? This cannot be undone." with destructive Delete and Cancel buttons. On confirm, calls `DELETE` and redirects to `/`.

### API functions

- `updateMedia(id, { name?, description? })` — PATCH
- `replaceMediaFile(id, file)` — PUT with FormData
- `deleteMedia(id)` — DELETE

Each uses `useMutation` with query invalidation on success.

## E2E Tests

New `media-actions.test.ts`:

1. Edit name and description — verify updated values shown after save
2. Cancel edit discards changes — verify original values remain
3. Replace file — upload JPG, replace with PNG, verify image src changes
4. Delete with confirmation — click Delete, cancel, verify still on page; click Delete, confirm, verify redirect to `/`
5. Deleted media disappears from browse — delete, go to browse, verify grid is empty

Extend `MediaPage` POM with edit/delete/replace locators and confirmation dialog.
