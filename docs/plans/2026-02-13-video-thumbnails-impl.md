# Video Thumbnails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate gallery thumbnails for video uploads using FFmpeg, and extract video dimensions via ffprobe — so videos show as thumbnail images in the gallery grid instead of loading full `<video>` elements.

**Architecture:** New `video` module shells out to `ffmpeg`/`ffprobe` via `tokio::process::Command` (async, non-blocking). FFmpeg extracts a raw PNG frame at the 1-second mark. Those bytes are fed into the existing `image` crate pipeline (Lanczos3 resize → WebP save) via a new `generate_gallery_thumb()` function in the thumbnails module. Only the gallery `_thumb.webp` is produced for videos (no clipboard PNG). Frontend overrides `media_type` to `'image'` when rendering thumbnailed videos in the gallery grid.

**Tech Stack:** Rust (tokio::process, image crate), FFmpeg/ffprobe (system CLI), React, Playwright E2E.

**Design doc:** `docs/plans/2026-02-13-video-thumbnails-design.md`

---

### Task 1: Create the video module

**Files:**
- Create: `backend/src/video.rs`
- Modify: `backend/src/main.rs:1-6` (add `mod video`)

**Step 1: Create `backend/src/video.rs`**

```rust
use std::path::Path;

use tokio::process::Command;

use crate::error::AppError;

/// Extract a single video frame as PNG bytes.
///
/// Tries the frame at 1 second first; if that fails (e.g. video is shorter),
/// retries at 0 seconds (first frame).
pub async fn extract_frame(path: &Path) -> Result<Vec<u8>, AppError> {
    let output = Command::new("ffmpeg")
        .args([
            "-ss", "1",
            "-i", path.to_str().unwrap_or_default(),
            "-vframes", "1",
            "-f", "image2",
            "-c:v", "png",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to run ffmpeg: {e}")))?;

    if output.status.success() && !output.stdout.is_empty() {
        return Ok(output.stdout);
    }

    // Retry at 0s for short videos
    let output = Command::new("ffmpeg")
        .args([
            "-ss", "0",
            "-i", path.to_str().unwrap_or_default(),
            "-vframes", "1",
            "-f", "image2",
            "-c:v", "png",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to run ffmpeg (retry): {e}")))?;

    if output.status.success() && !output.stdout.is_empty() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::Internal(format!("ffmpeg frame extraction failed: {stderr}")))
    }
}

/// Extract video dimensions (width, height) using ffprobe.
pub async fn probe_dimensions(path: &Path) -> Result<(i32, i32), AppError> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            path.to_str().unwrap_or_default(),
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to run ffprobe: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!("ffprobe failed: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = stdout.trim().split(',');
    let width: i32 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| AppError::Internal("ffprobe: could not parse width".into()))?;
    let height: i32 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| AppError::Internal("ffprobe: could not parse height".into()))?;

    Ok((width, height))
}
```

**Step 2: Add `mod video` to `backend/src/main.rs`**

Add `mod video;` after `mod thumbnails;` (line 6):

```rust
mod auth;
mod config;
mod error;
mod models;
mod routes;
mod thumbnails;
mod video;
```

**Step 3: Verify it compiles**

Run: `cargo build` from `backend/`
Expected: compiles (unused warnings are fine at this stage)

**Step 4: Commit**

```bash
git add backend/src/video.rs backend/src/main.rs
git commit -m "feat: add video module with ffmpeg frame extraction and ffprobe dimensions"
```

---

### Task 2: Add `generate_gallery_thumb` to the thumbnails module

**Files:**
- Modify: `backend/src/thumbnails.rs` (add new public function)

**Step 1: Add `generate_gallery_thumb()` after `generate()`**

Insert after the `generate()` function (after line 57):

```rust
/// Generate only the gallery thumbnail (WebP) from raw image bytes.
/// Used for video frames where a clipboard copy isn't needed.
pub fn generate_gallery_thumb(
    bytes: &[u8],
    upload_dir: &Path,
    file_stem: &str,
) -> Result<(), AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    let thumb_path = upload_dir.join(format!("{file_stem}_thumb.webp"));
    thumb
        .save(&thumb_path)
        .map_err(|e| AppError::Internal(format!("Failed to save thumbnail: {e}")))?;

    Ok(())
}
```

**Step 2: Verify it compiles**

Run: `cargo build` from `backend/`
Expected: compiles cleanly

**Step 3: Commit**

```bash
git add backend/src/thumbnails.rs
git commit -m "feat: add generate_gallery_thumb for video-only thumbnail generation"
```

---

### Task 3: Update the upload handler to process videos

**Files:**
- Modify: `backend/src/routes/media.rs:262-287` (upload handler)

**Step 1: Replace the dimension extraction and thumbnail generation block**

Replace lines 262-287 (from `// Extract image dimensions` through the thumbnail generation match block) with:

```rust
    // Extract dimensions and generate thumbnails
    let (width, height) = if media_type != MediaType::Video {
        extract_image_dimensions(&bytes)
            .map(|(w, h)| (Some(w), Some(h)))
            .unwrap_or((None, None))
    } else {
        // Extract video dimensions via ffprobe (best-effort)
        match crate::video::probe_dimensions(&file_path).await {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(e) => {
                tracing::warn!("Video dimension extraction failed: {e}");
                (None, None)
            }
        }
    };

    // Generate thumbnails (best-effort)
    if media_type != MediaType::Video {
        let thumb_dir = upload_dir.to_string();
        let thumb_stem = file_name
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| file_name.clone());
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&bytes, Path::new(&thumb_dir), &thumb_stem)
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }
    } else {
        // Extract a video frame and generate gallery thumbnail
        let thumb_stem = file_name
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| file_name.clone());
        match crate::video::extract_frame(&file_path).await {
            Ok(frame_bytes) => {
                let thumb_dir = upload_dir.to_string();
                let result = tokio::task::spawn_blocking(move || {
                    crate::thumbnails::generate_gallery_thumb(
                        &frame_bytes,
                        Path::new(&thumb_dir),
                        &thumb_stem,
                    )
                })
                .await;
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => tracing::warn!("Video thumbnail generation failed: {e}"),
                    Err(e) => tracing::warn!("Video thumbnail task panicked: {e}"),
                }
            }
            Err(e) => tracing::warn!("Video frame extraction failed: {e}"),
        }
    }
```

**Step 2: Verify it compiles**

Run: `cargo build` from `backend/`
Expected: compiles cleanly

**Step 3: Commit**

```bash
git add backend/src/routes/media.rs
git commit -m "feat: generate thumbnails and extract dimensions for video uploads"
```

---

### Task 4: Update the replace handler to process videos

**Files:**
- Modify: `backend/src/routes/media.rs:433-464` (replace handler)

**Step 1: Replace the dimension extraction and thumbnail generation block in replace_file**

Replace lines 433-464 (from the dimension extraction through thumbnail generation) with the same pattern as the upload handler — copy the exact block from Task 3, using `file_path` constructed at line 426.

**Step 2: Verify it compiles**

Run: `cargo build` from `backend/`
Expected: compiles cleanly

**Step 3: Commit**

```bash
git add backend/src/routes/media.rs
git commit -m "feat: handle video thumbnails in replace handler"
```

---

### Task 5: Update `into_response()` to return thumbnail URL for videos

**Files:**
- Modify: `backend/src/models/media.rs:61-72`

**Step 1: Change the `into_response` method**

Replace lines 61-72 with:

```rust
        let stem = std::path::Path::new(&self.file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&self.file_path);

        let thumbnail_url = Some(format!("/api/files/{stem}_thumb.webp"));

        let clipboard_url = if self.media_type != MediaType::Video {
            Some(format!("/api/files/{stem}_clipboard.png"))
        } else {
            None
        };
```

All media types now get `thumbnail_url`. Only non-videos get `clipboard_url`.

**Step 2: Verify it compiles**

Run: `cargo build` from `backend/`
Expected: compiles cleanly

**Step 3: Commit**

```bash
git add backend/src/models/media.rs
git commit -m "feat: return thumbnail URL for videos in API response"
```

---

### Task 6: Update frontend gallery to render video thumbnails as images

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx:245`

**Step 1: Override `media_type` alongside `file_url` when thumbnail is available**

Change line 245 from:

```tsx
item={item.thumbnail_url ? { ...item, file_url: item.thumbnail_url } : item}
```

to:

```tsx
item={item.thumbnail_url ? { ...item, file_url: item.thumbnail_url, media_type: 'image' as const } : item}
```

This makes the `Media` component render an `<img>` tag for thumbnailed videos instead of a `<video>` tag. The play icon overlay at line 250 still uses the original `item.media_type`, so it appears correctly.

**Step 2: Commit**

```bash
git add frontend/src/pages/HomePage.tsx
git commit -m "feat: render video thumbnails as images in gallery grid"
```

---

### Task 7: Update E2E tests

**Files:**
- Modify: `frontend/e2e/tests/upload.test.ts:117-132`
- Modify: `frontend/e2e/tests/browse.test.ts:41-48`

**Step 1: Update the MP4 upload test to expect thumbnail URL**

Replace the test at lines 117-132 (`'upload MP4 does not return thumbnail URLs'`) with:

```typescript
e2eTest('upload MP4 returns thumbnail URL', async ({ page, uploadPage }) => {
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

  expect(data.thumbnail_url).toBeTruthy();
  expect(data.thumbnail_url).toContain('_thumb.webp');
  expect(data.clipboard_url).toBeNull();
});

e2eTest('video thumbnail file is servable after upload', async ({ page, uploadPage }) => {
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

  const thumbRes = await page.request.get(data.thumbnail_url);
  expect(thumbRes.ok()).toBe(true);
});
```

**Step 2: Update the browse test to expect video thumbnails as images**

Replace the test at lines 41-48 (`'grid shows video with play icon'`) with:

```typescript
e2eTest('grid shows video thumbnail as image with play icon', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  // Video thumbnail renders as <img>, not <video>
  await expect(browsePage.gridImages()).toHaveCount(1);
  await expect(browsePage.gridVideos()).toHaveCount(0);
  const imgSrc = await browsePage.gridImages().first().getAttribute('src');
  expect(imgSrc).toContain('_thumb.webp');
});
```

**Step 3: Start the test database and run E2E tests**

Run: `pnpm test:db:start && pnpm test:e2e` from `frontend/`
Expected: all tests pass (requires `ffmpeg` on PATH)

**Step 4: Commit**

```bash
git add frontend/e2e/tests/upload.test.ts frontend/e2e/tests/browse.test.ts
git commit -m "test: update e2e tests for video thumbnails"
```

---

### Task 8: Manual smoke test

**Step 1:** Start the dev environment with `./dev.sh`

**Step 2:** Upload a video (MP4 or MOV) through the UI

**Step 3:** Verify the gallery shows the video as a thumbnail image with a play icon overlay

**Step 4:** Click the video card and verify the full video plays on the detail page

**Step 5:** Replace the video file and verify the new thumbnail appears

**Step 6:** Delete the video and verify cleanup (check uploads directory)
