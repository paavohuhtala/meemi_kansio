# Thumbnail Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate two thumbnail variants (400px WebP gallery thumb, 1024px PNG clipboard) for every image/GIF upload, serve them to the frontend for faster gallery loads and instant clipboard sharing.

**Architecture:** New `thumbnails` module in the backend handles image resizing via the `image` crate. Thumbnails are generated synchronously during upload, stored flat alongside originals with suffix naming (`{uuid}_thumb.webp`, `{uuid}_clipboard.png`). Frontend uses thumbnail URLs from the API response — gallery shows WebP thumbs, clipboard uses pre-rendered PNGs.

**Tech Stack:** Rust `image` crate (already in Cargo.toml), React, styled-components, Playwright for E2E.

**Design doc:** `docs/plans/2026-02-13-thumbnail-generation-design.md`

---

### Task 1: Create the thumbnails module

**Files:**
- Create: `backend/src/thumbnails.rs`
- Modify: `backend/src/main.rs:1-5` (add `mod thumbnails`)

**Step 1: Create `backend/src/thumbnails.rs`**

```rust
use std::io::{BufWriter, Cursor};
use std::path::Path;

use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageReader};

use crate::error::AppError;

const THUMB_MAX_DIM: u32 = 400;
const CLIPBOARD_MAX_DIM: u32 = 1024;

/// Resize an image so its longest dimension is at most `max_dim`.
/// Returns the image unchanged if it's already within bounds.
fn resize_to_max(img: &DynamicImage, max_dim: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let longest = w.max(h);
    if longest <= max_dim {
        return img.clone();
    }
    img.resize(
        (w as f64 * max_dim as f64 / longest as f64) as u32,
        (h as f64 * max_dim as f64 / longest as f64) as u32,
        FilterType::Lanczos3,
    )
}

/// Generate gallery thumbnail (WebP) and clipboard copy (PNG) for a media file.
/// `bytes` is the raw uploaded file content.
/// `upload_dir` is the directory where thumbnails are written.
/// `file_stem` is the UUID portion of the filename (e.g. "abc123" from "abc123.jpg").
pub fn generate(
    bytes: &[u8],
    upload_dir: &Path,
    file_stem: &str,
) -> Result<(), AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    // Gallery thumbnail — WebP at ~80% quality
    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    let thumb_path = upload_dir.join(format!("{file_stem}_thumb.webp"));
    let thumb_file = std::fs::File::create(&thumb_path)
        .map_err(|e| AppError::Internal(format!("Failed to create thumbnail file: {e}")))?;
    let encoder = WebPEncoder::new_with_quality(BufWriter::new(thumb_file), image::codecs::webp::WebPQuality::lossy(80));
    thumb.write_with_encoder(encoder)
        .map_err(|e| AppError::Internal(format!("Failed to encode thumbnail: {e}")))?;

    // Clipboard copy — PNG, lossless
    let clipboard = resize_to_max(&img, CLIPBOARD_MAX_DIM);
    let clipboard_path = upload_dir.join(format!("{file_stem}_clipboard.png"));
    clipboard
        .save(&clipboard_path)
        .map_err(|e| AppError::Internal(format!("Failed to save clipboard image: {e}")))?;

    Ok(())
}

/// Return the thumbnail file paths derived from the original filename.
/// Used for cleanup during delete/replace.
pub fn thumbnail_paths(upload_dir: &Path, file_name: &str) -> [std::path::PathBuf; 2] {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    [
        upload_dir.join(format!("{stem}_thumb.webp")),
        upload_dir.join(format!("{stem}_clipboard.png")),
    ]
}
```

**Step 2: Register the module in `backend/src/main.rs`**

Add `mod thumbnails;` to the module declarations at the top of `main.rs` (after `mod routes;`):

```rust
mod auth;
mod config;
mod error;
mod models;
mod routes;
mod thumbnails;
```

**Step 3: Verify it compiles**

Run: `cargo build` (from `backend/`)
Expected: compiles successfully (module is defined but not yet called)

**Step 4: Commit**

```bash
git add backend/src/thumbnails.rs backend/src/main.rs
git commit -m "feat: add thumbnails module for image resizing"
```

---

### Task 2: Integrate thumbnail generation into upload handler

**Files:**
- Modify: `backend/src/routes/media.rs:178-303` (upload handler)

**Step 1: Add thumbnail generation to the upload handler**

In `backend/src/routes/media.rs`, after the file is written to disk and dimensions are extracted (after line 269), add thumbnail generation for images and GIFs. The generation runs on a blocking thread since it's CPU-bound.

After this block (lines 262-269):
```rust
    // Extract image dimensions (skip for videos)
    let (width, height) = if media_type != MediaType::Video {
        extract_image_dimensions(&bytes)
            .map(|(w, h)| (Some(w), Some(h)))
            .unwrap_or((None, None))
    } else {
        (None, None)
    };
```

Insert:
```rust
    // Generate thumbnails for images and GIFs (best-effort)
    if media_type != MediaType::Video {
        let thumb_bytes = bytes.clone();
        let thumb_dir = upload_dir.to_string();
        let thumb_stem = file_name
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| file_name.clone());
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&thumb_bytes, Path::new(&thumb_dir), &thumb_stem)
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }
    }
```

**Step 2: Verify it compiles**

Run: `cargo build` (from `backend/`)
Expected: compiles successfully

---

### Task 3: Integrate thumbnail cleanup into delete and replace handlers

**Files:**
- Modify: `backend/src/routes/media.rs:446-462` (delete handler)
- Modify: `backend/src/routes/media.rs:357-444` (replace handler)

**Step 1: Update delete handler**

In `delete_media`, after deleting the original file (line 459), also delete the thumbnails:

Replace:
```rust
    // Delete file from disk (best-effort)
    let file_path = Path::new(&state.config.upload_dir).join(&media.file_path);
    let _ = tokio::fs::remove_file(&file_path).await;
```

With:
```rust
    // Delete file and thumbnails from disk (best-effort)
    let upload_dir = Path::new(&state.config.upload_dir);
    let _ = tokio::fs::remove_file(upload_dir.join(&media.file_path)).await;
    for thumb_path in crate::thumbnails::thumbnail_paths(upload_dir, &media.file_path) {
        let _ = tokio::fs::remove_file(&thumb_path).await;
    }
```

**Step 2: Update replace handler**

In `replace_file`, after deleting the old file (line 425), also delete old thumbnails. Then after writing the new file, generate new thumbnails.

Replace:
```rust
    // Delete old file from disk (best-effort)
    let old_path = Path::new(upload_dir).join(&old_media.file_path);
    let _ = tokio::fs::remove_file(&old_path).await;
```

With:
```rust
    // Delete old file and thumbnails from disk (best-effort)
    let upload_dir_path = Path::new(upload_dir);
    let _ = tokio::fs::remove_file(upload_dir_path.join(&old_media.file_path)).await;
    for thumb_path in crate::thumbnails::thumbnail_paths(upload_dir_path, &old_media.file_path) {
        let _ = tokio::fs::remove_file(&thumb_path).await;
    }
```

Then, after writing the new file to disk (after line 413: `tokio::fs::write(&file_path, &bytes)`) and extracting dimensions, add thumbnail generation just like in the upload handler:

After the dimension extraction block in `replace_file` (after line 421), insert:
```rust
    // Generate thumbnails for images and GIFs (best-effort)
    if media_type != MediaType::Video {
        let thumb_bytes = bytes.clone();
        let thumb_dir = upload_dir.to_string();
        let thumb_stem = file_name
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| file_name.clone());
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&thumb_bytes, Path::new(&thumb_dir), &thumb_stem)
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }
    }
```

**Step 3: Verify it compiles**

Run: `cargo build` (from `backend/`)
Expected: compiles successfully

---

### Task 4: Add thumbnail URLs to MediaResponse

**Files:**
- Modify: `backend/src/models/media.rs:33-73` (MediaResponse + into_response)

**Step 1: Add fields to MediaResponse**

In `MediaResponse`, add two new fields after `file_url`:

```rust
pub thumbnail_url: Option<String>,
pub clipboard_url: Option<String>,
```

**Step 2: Update `into_response` to derive thumbnail URLs**

The logic: for images and GIFs, derive the thumbnail URLs from `file_path` by replacing the extension. For videos, set both to `None`.

Replace the `into_response` method:

```rust
impl Media {
    pub fn into_response(self, tags: Vec<String>) -> MediaResponse {
        let file_url = format!("/api/files/{}", self.file_path);

        let (thumbnail_url, clipboard_url) = if self.media_type != MediaType::Video {
            let stem = std::path::Path::new(&self.file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&self.file_path);
            (
                Some(format!("/api/files/{stem}_thumb.webp")),
                Some(format!("/api/files/{stem}_clipboard.png")),
            )
        } else {
            (None, None)
        };

        MediaResponse {
            id: self.id,
            name: self.name,
            description: self.description,
            media_type: self.media_type,
            file_url,
            thumbnail_url,
            clipboard_url,
            file_size: self.file_size,
            mime_type: self.mime_type,
            width: self.width,
            height: self.height,
            uploaded_by: self.uploaded_by,
            created_at: self.created_at,
            tags,
        }
    }
}
```

**Step 3: Verify it compiles**

Run: `cargo build` (from `backend/`)
Expected: compiles successfully

**Step 4: Commit all backend changes**

```bash
git add backend/src/
git commit -m "feat: generate thumbnails on upload and include URLs in API response"
```

---

### Task 5: Update frontend types and gallery

**Files:**
- Modify: `frontend/src/api/media.ts:3-16` (MediaItem interface)
- Modify: `frontend/src/pages/HomePage.tsx:240-245` (gallery card rendering)

**Step 1: Add fields to MediaItem**

In `frontend/src/api/media.ts`, add two fields to the `MediaItem` interface after `file_url`:

```typescript
thumbnail_url: string | null;
clipboard_url: string | null;
```

**Step 2: Update gallery to use thumbnail URL**

In `frontend/src/pages/HomePage.tsx`, change the `<Media>` usage inside the grid to use `thumbnail_url` when available. Replace line 244:

```tsx
<Media item={item} loading="lazy" preload="metadata" />
```

With:

```tsx
<Media
  item={item.thumbnail_url ? { ...item, file_url: item.thumbnail_url } : item}
  loading="lazy"
  preload="metadata"
/>
```

This overrides `file_url` with the thumbnail URL for rendering, while keeping the original `item` intact for other uses (overlay, links). Videos don't have `thumbnail_url` so they fall through unchanged.

**Step 3: Verify it compiles**

Run: `pnpm build` (from `frontend/`)
Expected: build succeeds

---

### Task 6: Update clipboard copy to use pre-rendered PNG

**Files:**
- Modify: `frontend/src/components/MediaOverlay.tsx:5-9,39-66,75-109` (props, copy logic, render)
- Modify: `frontend/src/pages/HomePage.tsx:247-251` (MediaOverlay usage)
- Modify: `frontend/src/pages/MediaPage.tsx:284-288` (MediaOverlay usage)

**Step 1: Add `clipboardUrl` prop to MediaOverlay**

In `frontend/src/components/MediaOverlay.tsx`, add `clipboardUrl` to the props interface:

```typescript
interface MediaOverlayProps {
  fileUrl: string;
  fileName: string;
  mediaType: 'image' | 'video' | 'gif';
  clipboardUrl?: string | null;
}
```

**Step 2: Update the copy logic and `canCopy`**

Update the component to use the pre-rendered PNG when available, and enable copy for GIFs that have a clipboard URL:

```typescript
export function MediaOverlay({ fileUrl, fileName, mediaType, clipboardUrl }: MediaOverlayProps) {
  const [copied, setCopied] = useState(false);
  const canCopy = mediaType === 'image' || !!clipboardUrl;

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (clipboardUrl) {
        const res = await fetch(clipboardUrl, { credentials: 'include' });
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
      } else {
        await copyImageToClipboard(fileUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silently fail
    }
  }
```

**Step 3: Pass `clipboardUrl` in HomePage.tsx**

In `frontend/src/pages/HomePage.tsx`, update the `<MediaOverlay>` usage (around line 247):

```tsx
<MediaOverlay
  fileUrl={item.file_url}
  fileName={item.name ?? `media-${item.id}`}
  mediaType={item.media_type}
  clipboardUrl={item.clipboard_url}
/>
```

**Step 4: Pass `clipboardUrl` in MediaPage.tsx**

In `frontend/src/pages/MediaPage.tsx`, update the `<MediaOverlay>` usage (around line 284):

```tsx
<MediaOverlay
  fileUrl={media.file_url}
  fileName={media.name ?? `media-${media.id}`}
  mediaType={media.media_type}
  clipboardUrl={media.clipboard_url}
/>
```

**Step 5: Verify it compiles**

Run: `pnpm build` (from `frontend/`)
Expected: build succeeds

**Step 6: Commit frontend changes**

```bash
git add frontend/src/
git commit -m "feat: use thumbnails in gallery and pre-rendered PNG for clipboard"
```

---

### Task 7: E2E tests for thumbnail generation

**Files:**
- Modify: `frontend/e2e/tests/upload.test.ts` (add thumbnail tests)
- Modify: `frontend/e2e/tests/browse.test.ts` (add gallery thumbnail test)

**Step 1: Add thumbnail URL tests to upload.test.ts**

Add these tests after the existing upload tests in `frontend/e2e/tests/upload.test.ts`:

```typescript
e2eTest('upload JPG returns thumbnail URLs', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  expect(data.thumbnail_url).toBeTruthy();
  expect(data.thumbnail_url).toContain('_thumb.webp');
  expect(data.clipboard_url).toBeTruthy();
  expect(data.clipboard_url).toContain('_clipboard.png');
});

e2eTest('thumbnail files are servable after upload', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  const thumbRes = await page.request.get(data.thumbnail_url);
  expect(thumbRes.ok()).toBe(true);

  const clipboardRes = await page.request.get(data.clipboard_url);
  expect(clipboardRes.ok()).toBe(true);
});

e2eTest('upload MP4 does not return thumbnail URLs', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'kitten_horn.mp4'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  expect(data.thumbnail_url).toBeNull();
  expect(data.clipboard_url).toBeNull();
});
```

**Step 2: Add gallery thumbnail test to browse.test.ts**

Add this test after the existing browse tests in `frontend/e2e/tests/browse.test.ts`:

```typescript
e2eTest('gallery images use thumbnail URLs', async ({ page, uploadPage, browsePage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  const imgSrc = await browsePage.gridImages().first().getAttribute('src');
  expect(imgSrc).toContain('_thumb.webp');
});
```

**Step 3: Run e2e tests**

Run: `pnpm test:e2e` (from `frontend/`)
Expected: all tests pass, including the new ones

**Step 4: Commit tests**

```bash
git add frontend/e2e/
git commit -m "test: add e2e tests for thumbnail generation"
```

---

### Task 8: Manual smoke test

**Step 1: Start the dev environment**

Run: `./dev.sh` (from project root)

**Step 2: Test the full flow**

1. Open the app in a browser
2. Upload a JPG — verify it redirects to detail page, image displays
3. Go to the home page — verify the gallery image loads (check network tab: should fetch `_thumb.webp`)
4. Hover over the image — click copy button, paste somewhere to verify the clipboard PNG works
5. Upload a GIF — verify gallery shows static thumbnail, copy button works
6. Upload a video — verify it still works without thumbnails
7. Delete a media item — verify thumbnails are cleaned up from disk

**Step 3: Check the uploads directory**

Run: `ls backend/uploads/` and verify for each uploaded image there are three files:
- `{uuid}.{ext}` (original)
- `{uuid}_thumb.webp` (gallery thumbnail)
- `{uuid}_clipboard.png` (clipboard copy)
