# Production Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy meemi_kansio to production with Scaleway Serverless Containers, S3 storage, Supabase PostgreSQL, OpenTofu IaC, and GitHub Actions CI/CD.

**Architecture:** Single Docker image serving both API and frontend static files. Storage abstracted via a `StorageBackend` enum with `Local` (dev) and `S3` (prod) variants. Infrastructure managed by OpenTofu, deployed via GitHub Actions on release promotion.

**Tech Stack:** Rust/Axum, aws-sdk-s3, Docker, OpenTofu, GitHub Actions, Scaleway (Serverless Containers, Container Registry, Object Storage), Supabase PostgreSQL, AWS Route 53

**Design doc:** `docs/plans/2026-02-15-production-deployment-design.md`

---

### Task 1: Refactor thumbnail module to return bytes instead of writing to disk

Currently `thumbnails::generate` and `thumbnails::generate_gallery_thumb` write files directly to disk. Refactor them to return byte vectors so the caller can decide where to store them (local filesystem or S3).

**Files:**
- Modify: `backend/src/thumbnails.rs`

**Step 1: Change `generate` to return thumbnail bytes**

Replace the current implementation that saves files with one that returns the encoded bytes:

```rust
use std::io::Cursor;
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader};
use crate::error::AppError;

const THUMB_MAX_DIM: u32 = 600;
const CLIPBOARD_MAX_DIM: u32 = 1024;

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

fn encode_webp(img: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::WebP)
        .map_err(|e| AppError::Internal(format!("Failed to encode WebP: {e}")))?;
    Ok(buf.into_inner())
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| AppError::Internal(format!("Failed to encode PNG: {e}")))?;
    Ok(buf.into_inner())
}

/// Generate gallery thumbnail (WebP bytes) and clipboard copy (PNG bytes).
/// Returns (thumbnail_webp, clipboard_png).
pub fn generate(bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>), AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    let clipboard = resize_to_max(&img, CLIPBOARD_MAX_DIM);

    Ok((encode_webp(&thumb)?, encode_png(&clipboard)?))
}

/// Generate only the gallery thumbnail (WebP bytes) from raw image bytes.
/// Used for video frames where a clipboard copy isn't needed.
pub fn generate_gallery_thumb(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    encode_webp(&thumb)
}

/// Return the thumbnail storage keys derived from the original filename.
/// Used for cleanup during delete/replace.
pub fn thumbnail_keys(file_name: &str) -> [String; 2] {
    let stem = std::path::Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    [
        format!("{stem}_thumb.webp"),
        format!("{stem}_clipboard.png"),
    ]
}
```

Note: `thumbnail_paths` (returning `PathBuf`s) is replaced by `thumbnail_keys` (returning `String` keys). The `std::path::Path` import for the module can be removed.

**Step 2: Verify it compiles**

Run: `cargo check` (from `backend/`)

This will fail because `media.rs` still calls the old signatures. That's expected — we fix the callers in Task 3.

---

### Task 2: Create StorageBackend with LocalStorage

Create the storage abstraction. Uses an enum instead of a trait to avoid `async-trait` dependency and keep things simple.

**Files:**
- Create: `backend/src/storage.rs`
- Modify: `backend/src/main.rs` (add `mod storage`, add to `AppState`)
- Modify: `backend/src/config.rs` (add S3 config fields — optional for now)

**Step 1: Create `backend/src/storage.rs`**

```rust
use std::path::PathBuf;

use crate::error::AppError;

pub struct LocalStorage {
    upload_dir: PathBuf,
}

impl LocalStorage {
    pub fn new(upload_dir: &str) -> Self {
        Self {
            upload_dir: PathBuf::from(upload_dir),
        }
    }

    pub async fn put(&self, key: &str, data: &[u8], _content_type: &str) -> Result<(), AppError> {
        let path = self.upload_dir.join(key);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to create directory: {e}")))?;
        }
        tokio::fs::write(&path, data)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let path = self.upload_dir.join(key);
        tokio::fs::read(&path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read file {key}: {e}")))
    }

    pub async fn delete(&self, key: &str) {
        let path = self.upload_dir.join(key);
        let _ = tokio::fs::remove_file(&path).await;
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("/api/files/{key}")
    }
}

pub enum StorageBackend {
    Local(LocalStorage),
}

impl StorageBackend {
    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        match self {
            Self::Local(s) => s.put(key, data, content_type).await,
        }
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        match self {
            Self::Local(s) => s.get(key).await,
        }
    }

    pub async fn delete(&self, key: &str) {
        match self {
            Self::Local(s) => s.delete(key).await,
        }
    }

    pub fn public_url(&self, key: &str) -> String {
        match self {
            Self::Local(s) => s.public_url(key),
        }
    }
}
```

**Step 2: Add `StorageBackend` to `AppState` and `main.rs`**

In `main.rs`:
- Add `mod storage;`
- Add `use storage::{LocalStorage, StorageBackend};`
- Add `storage: StorageBackend` field to `AppState`
- Initialize `StorageBackend::Local(LocalStorage::new(&config.upload_dir))` in `main()`

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Arc<Config>,
    pub ocr: Option<Arc<OcrEngine>>,
    pub storage: StorageBackend,
}
```

`StorageBackend` needs to derive `Clone`. `LocalStorage` stores a `PathBuf` which is `Clone`. Add `#[derive(Clone)]` to both.

The `api_router` function in `routes/mod.rs` currently takes `upload_dir: &str`. After Task 3, this parameter will be removed (the router gets storage from AppState). For now, keep it to avoid compile errors.

**Step 3: Verify it compiles**

Run: `cargo check` (from `backend/`)

---

### Task 3: Refactor media handlers to use StorageBackend

Replace direct filesystem operations in `media.rs` with `StorageBackend` calls. Update `into_response` to generate URLs via storage. Refactor OCR task to accept bytes directly.

**Files:**
- Modify: `backend/src/routes/media.rs`
- Modify: `backend/src/routes/mod.rs`
- Modify: `backend/src/models/media.rs`
- Modify: `backend/src/ocr.rs`

**Step 1: Update `Media::into_response` to accept `StorageBackend`**

In `backend/src/models/media.rs`:

```rust
use crate::storage::StorageBackend;

impl Media {
    pub fn into_response(self, tags: Vec<String>, storage: &StorageBackend) -> MediaResponse {
        let file_url = storage.public_url(&self.file_path);

        let stem = std::path::Path::new(&self.file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&self.file_path);

        let thumbnail_url = Some(storage.public_url(&format!("{stem}_thumb.webp")));

        let clipboard_url = if self.media_type != MediaType::Video {
            Some(storage.public_url(&format!("{stem}_clipboard.png")))
        } else {
            None
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
            ocr_text: self.ocr_text,
            uploaded_by: self.uploaded_by,
            created_at: self.created_at,
            tags,
        }
    }
}
```

**Step 2: Refactor `ocr::spawn_ocr_task` to accept bytes instead of file path**

In `backend/src/ocr.rs`, change `spawn_ocr_task` to take `Vec<u8>` instead of `PathBuf`:

```rust
pub fn spawn_ocr_task(
    engine: Arc<OcrEngine>,
    db: PgPool,
    media_id: Uuid,
    image_bytes: Vec<u8>,
) {
    tokio::spawn(async move {
        let result =
            tokio::task::spawn_blocking(move || recognize(&engine, &image_bytes)).await;

        match result {
            Ok(Some(text)) => {
                if let Err(e) = sqlx::query("UPDATE media SET ocr_text = $1 WHERE id = $2")
                    .bind(&text)
                    .bind(media_id)
                    .execute(&db)
                    .await
                {
                    tracing::warn!("Failed to save OCR text for {media_id}: {e}");
                }
            }
            Ok(None) => {
                tracing::debug!("No text detected by OCR for {media_id}");
            }
            Err(e) => {
                tracing::warn!("OCR task panicked for {media_id}: {e}");
            }
        }
    });
}
```

Remove the `PathBuf` import if no longer needed.

**Step 3: Refactor the `upload` handler**

Key changes to `backend/src/routes/media.rs` upload handler:
- Remove `tokio::fs::create_dir_all` and `tokio::fs::write` — replaced by `state.storage.put()`
- Use `state.storage.put()` for original file, thumbnails, and clipboard image
- Generate thumbnails in memory (using the refactored `thumbnails::generate` from Task 1)
- For video: write bytes to a temp file for FFmpeg, extract frame, generate thumb bytes, then `storage.put()` the thumb, clean up temp file
- Pass bytes directly to `ocr::spawn_ocr_task`

The upload handler becomes (showing the key structural changes):

```rust
async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, AppError> {
    // ... multipart parsing stays the same ...

    let (mime, bytes) = file_data.ok_or_else(|| AppError::BadRequest("No file provided".into()))?;
    let media_type = media_type_from_mime(&mime)
        .ok_or_else(|| AppError::BadRequest("Unknown media type".into()))?;
    let ext = extension_from_mime(&mime);
    let file_name = format!("{}.{ext}", Uuid::new_v4());
    let file_size = bytes.len() as i64;

    // Store the original file
    state.storage.put(&file_name, &bytes, &mime).await?;

    let file_stem = file_name.rsplit_once('.').map(|(s, _)| s.to_string())
        .unwrap_or_else(|| file_name.clone());

    // Extract dimensions and generate thumbnails
    let (width, height, ocr_bytes) = if media_type != MediaType::Video {
        let dims = extract_image_dimensions(&bytes);
        let (w, h) = dims.map(|(w, h)| (Some(w), Some(h))).unwrap_or((None, None));

        // Generate thumbnails in memory
        let thumb_stem = file_stem.clone();
        let img_bytes = bytes.clone();
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&img_bytes)
        }).await;
        match result {
            Ok(Ok((thumb_bytes, clipboard_bytes))) => {
                let _ = state.storage.put(
                    &format!("{thumb_stem}_thumb.webp"), &thumb_bytes, "image/webp"
                ).await;
                let _ = state.storage.put(
                    &format!("{thumb_stem}_clipboard.png"), &clipboard_bytes, "image/png"
                ).await;
            }
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }

        (w, h, Some(bytes.clone()))
    } else {
        // Video: write to temp file for ffmpeg
        let temp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let temp_path = temp_dir.path().join(&file_name);
        tokio::fs::write(&temp_path, &bytes).await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;

        let dims = match crate::video::probe_dimensions(&temp_path).await {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(e) => {
                tracing::warn!("Video dimension extraction failed: {e}");
                (None, None)
            }
        };

        // Generate video thumbnail
        let mut thumb_bytes_for_ocr = None;
        match crate::video::extract_frame(&temp_path).await {
            Ok(frame_bytes) => {
                let stem = file_stem.clone();
                let fb = frame_bytes.clone();
                let result = tokio::task::spawn_blocking(move || {
                    crate::thumbnails::generate_gallery_thumb(&fb)
                }).await;
                match result {
                    Ok(Ok(thumb_bytes)) => {
                        thumb_bytes_for_ocr = Some(thumb_bytes.clone());
                        let _ = state.storage.put(
                            &format!("{stem}_thumb.webp"), &thumb_bytes, "image/webp"
                        ).await;
                    }
                    Ok(Err(e)) => tracing::warn!("Video thumbnail generation failed: {e}"),
                    Err(e) => tracing::warn!("Video thumbnail task panicked: {e}"),
                }
            }
            Err(e) => tracing::warn!("Video frame extraction failed: {e}"),
        }
        // temp_dir is dropped here, cleaning up the temp file

        (dims.0, dims.1, thumb_bytes_for_ocr)
    };

    // ... DB insert stays the same ...

    // Spawn background OCR task with bytes
    if let Some(ref ocr_engine) = state.ocr {
        if let Some(ocr_data) = ocr_bytes {
            crate::ocr::spawn_ocr_task(ocr_engine.clone(), state.db.clone(), media.id, ocr_data);
        }
    }

    Ok(Json(media.into_response(tags, &state.storage)))
}
```

Add `tempfile` to `backend/Cargo.toml`:
```toml
tempfile = "3"
```

**Step 4: Refactor the `delete_media` handler**

```rust
async fn delete_media(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let media = sqlx::query_as::<_, Media>("DELETE FROM media WHERE id = $1 RETURNING *")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    // Delete file and thumbnails from storage (best-effort)
    state.storage.delete(&media.file_path).await;
    for key in crate::thumbnails::thumbnail_keys(&media.file_path) {
        state.storage.delete(&key).await;
    }

    Ok(StatusCode::NO_CONTENT)
}
```

**Step 5: Refactor `replace_file`, `regenerate_thumbnail`, `run_ocr` handlers**

Apply the same pattern:
- `replace_file`: Use `storage.put()` for new file + thumbnails, `storage.delete()` for old file + thumbnails. Use temp file for video FFmpeg processing.
- `regenerate_thumbnail`: Use `storage.get()` to read the file bytes, generate thumbnails in memory, `storage.delete()` old thumbnails, `storage.put()` new thumbnails. For video, write to temp file for FFmpeg.
- `run_ocr`: Use `storage.get()` to read the file or thumbnail bytes for OCR processing.

**Step 6: Update all remaining handlers that return `MediaResponse`**

Every call to `media.into_response(tags)` becomes `media.into_response(tags, &state.storage)`:
- `get_media`
- `update_media`
- `set_tags`
- `list_media` (in the `.map()` closure)

For `list_media`:
```rust
.map(|m| {
    let tags = tags_map.remove(&m.id).unwrap_or_default();
    m.into_response(tags, &state.storage)
})
```

**Step 7: Update `routes/mod.rs` — remove `upload_dir` parameter**

The media router no longer needs `upload_dir` since it gets storage from AppState:

```rust
// backend/src/routes/mod.rs
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(invites::router())
        .merge(media::router())
        .merge(tags::router())
}
```

Update `media::router()` to remove the `upload_dir` parameter. The `/api/files` `ServeDir` route should only be mounted when using local storage. Move it to `main.rs`:

```rust
// In media.rs router():
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/media/upload", post(upload))
        // ... same routes, just remove .nest_service("/api/files", ...)
}

// In main.rs, after creating the router:
if let StorageBackend::Local(ref local) = state.storage {
    // Serve uploaded files locally in dev mode
    app = app.nest_service("/api/files", ServeDir::new(&local.upload_dir));
}
```

Wait, `LocalStorage` doesn't expose `upload_dir` publicly. Add a getter:
```rust
impl LocalStorage {
    pub fn upload_dir(&self) -> &Path {
        &self.upload_dir
    }
}
```

And expose `LocalStorage` fields via the enum if needed:
```rust
impl StorageBackend {
    pub fn local_upload_dir(&self) -> Option<&Path> {
        match self {
            Self::Local(s) => Some(s.upload_dir()),
            // future S3 variant returns None
        }
    }
}
```

Update `main.rs`:
```rust
// Serve local files in dev mode
if let Some(upload_dir) = state.storage.local_upload_dir() {
    app = app.nest_service("/api/files", ServeDir::new(upload_dir));
}
```

Also update `main.rs` to call `api_router()` without the `upload_dir` argument.

**Step 8: Remove unused imports**

Clean up `media.rs`: remove `Path`, `ServeDir` imports. Remove `generate_video_thumbnail` helper function (its logic is now inline in the handlers). Remove the `std::path::Path` import from `thumbnails.rs` if no longer needed.

**Step 9: Run e2e tests to verify no regression**

```bash
cd frontend && pnpm test:db:start && pnpm test:e2e
```

All existing tests should pass — behavior is identical, only the internal storage mechanism changed.

**Step 10: Commit**

```bash
git add backend/src/storage.rs backend/src/main.rs backend/src/config.rs \
       backend/src/models/media.rs backend/src/routes/media.rs \
       backend/src/routes/mod.rs backend/src/ocr.rs backend/src/thumbnails.rs \
       backend/Cargo.toml backend/Cargo.lock
git commit -m "refactor: extract storage abstraction with LocalStorage backend"
```

---

### Task 4: Add S3Storage implementation

Add the S3 backend variant to the StorageBackend enum.

**Files:**
- Modify: `backend/Cargo.toml`
- Modify: `backend/src/storage.rs`
- Modify: `backend/src/config.rs`
- Modify: `backend/src/main.rs`

**Step 1: Add aws-sdk-s3 to Cargo.toml**

```toml
aws-sdk-s3 = "1"
aws-config = { version = "1", features = ["behavior-version-latest"] }
```

**Step 2: Add S3 config fields to Config**

In `backend/src/config.rs`:

```rust
pub struct Config {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub upload_dir: String,
    pub jwt_secret: String,
    pub static_dir: Option<String>,
    pub model_dir: String,
    pub storage_backend: String,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            // ... existing fields ...
            storage_backend: env::var("STORAGE_BACKEND").unwrap_or_else(|_| "local".to_string()),
            s3_bucket: env::var("S3_BUCKET").ok(),
            s3_region: env::var("S3_REGION").ok(),
            s3_endpoint: env::var("S3_ENDPOINT").ok(),
            s3_access_key_id: env::var("S3_ACCESS_KEY_ID").ok(),
            s3_secret_access_key: env::var("S3_SECRET_ACCESS_KEY").ok(),
        }
    }
}
```

**Step 3: Implement S3Storage and add to enum**

In `backend/src/storage.rs`:

```rust
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;

#[derive(Clone)]
pub struct S3Storage {
    client: S3Client,
    bucket: String,
    public_base_url: String,
}

impl S3Storage {
    pub async fn new(
        bucket: String,
        region: String,
        endpoint: String,
        access_key_id: String,
        secret_access_key: String,
    ) -> Self {
        let credentials = aws_sdk_s3::config::Credentials::new(
            access_key_id,
            secret_access_key,
            None, None, "env",
        );

        let config = aws_sdk_s3::config::Builder::new()
            .region(aws_sdk_s3::config::Region::new(region.clone()))
            .endpoint_url(&endpoint)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = S3Client::from_conf(config);
        let public_base_url = format!("{endpoint}/{bucket}");

        Self { client, bucket, public_base_url }
    }

    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data.to_vec()))
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("S3 put failed: {e}")))?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let resp = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("S3 get failed: {e}")))?;
        let bytes = resp.body.collect().await
            .map_err(|e| AppError::Internal(format!("S3 read body failed: {e}")))?;
        Ok(bytes.to_vec())
    }

    pub async fn delete(&self, key: &str) {
        let _ = self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await;
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_base_url)
    }
}

#[derive(Clone)]
pub enum StorageBackend {
    Local(LocalStorage),
    S3(S3Storage),
}

impl StorageBackend {
    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        match self {
            Self::Local(s) => s.put(key, data, content_type).await,
            Self::S3(s) => s.put(key, data, content_type).await,
        }
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        match self {
            Self::Local(s) => s.get(key).await,
            Self::S3(s) => s.get(key).await,
        }
    }

    pub async fn delete(&self, key: &str) {
        match self {
            Self::Local(s) => s.delete(key).await,
            Self::S3(s) => s.delete(key).await,
        }
    }

    pub fn public_url(&self, key: &str) -> String {
        match self {
            Self::Local(s) => s.public_url(key),
            Self::S3(s) => s.public_url(key),
        }
    }

    pub fn local_upload_dir(&self) -> Option<&std::path::Path> {
        match self {
            Self::Local(s) => Some(s.upload_dir()),
            Self::S3(_) => None,
        }
    }
}
```

**Step 4: Add storage initialization in main.rs**

```rust
let storage = match config.storage_backend.as_str() {
    "s3" => {
        let bucket = config.s3_bucket.clone()
            .expect("S3_BUCKET required when STORAGE_BACKEND=s3");
        let region = config.s3_region.clone()
            .expect("S3_REGION required when STORAGE_BACKEND=s3");
        let endpoint = config.s3_endpoint.clone()
            .expect("S3_ENDPOINT required when STORAGE_BACKEND=s3");
        let access_key = config.s3_access_key_id.clone()
            .expect("S3_ACCESS_KEY_ID required when STORAGE_BACKEND=s3");
        let secret_key = config.s3_secret_access_key.clone()
            .expect("S3_SECRET_ACCESS_KEY required when STORAGE_BACKEND=s3");
        StorageBackend::S3(S3Storage::new(bucket, region, endpoint, access_key, secret_key).await)
    }
    _ => StorageBackend::Local(LocalStorage::new(&config.upload_dir)),
};
```

**Step 5: Verify it compiles**

Run: `cargo check` (from `backend/`)

**Step 6: Run e2e tests (local mode still works)**

```bash
cd frontend && pnpm test:e2e
```

**Step 7: Commit**

```bash
git add backend/Cargo.toml backend/Cargo.lock backend/src/storage.rs \
       backend/src/config.rs backend/src/main.rs
git commit -m "feat: add S3 storage backend"
```

---

### Task 5: sqlx offline mode, OCR models, .env.example

Prepare the repository for Docker builds that don't have a live database.

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `backend/.sqlx/` (generated)

**Step 1: Install sqlx-cli and generate offline query cache**

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

Make sure the dev database is running, then:

```bash
cd backend && cargo sqlx prepare
```

This creates a `.sqlx/` directory with JSON files for each query.

**Step 2: Un-gitignore OCR models**

In `.gitignore`, change:
```
# OCR models
backend/models/
```
to:
```
# OCR models (keep model files, ignore any temp data)
```

(Remove the `backend/models/` line entirely.)

**Step 3: Add `.sqlx/` tracking to git**

The `.sqlx/` directory should be committed. It's not in `.gitignore` so it should be tracked automatically.

**Step 4: Create `.env.example`**

```env
# Database
DATABASE_URL=postgres://meemi:meemi@localhost:5432/meemi

# Server
HOST=0.0.0.0
PORT=3000

# Auth
JWT_SECRET=dev-secret-change-in-production

# File storage
UPLOAD_DIR=./uploads
STORAGE_BACKEND=local

# S3 storage (when STORAGE_BACKEND=s3)
# S3_BUCKET=meemit-media
# S3_REGION=fr-par
# S3_ENDPOINT=https://s3.fr-par.scw.cloud
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=

# Frontend static files (set to serve SPA from backend)
# STATIC_DIR=../frontend/dist

# OCR models directory
MODEL_DIR=./models
```

**Step 5: Commit**

```bash
git add .gitignore .env.example backend/.sqlx/ backend/models/
git commit -m "chore: add sqlx offline cache, OCR models, and .env.example"
```

---

### Task 6: Dockerfile and .dockerignore

Create the multi-stage Docker build.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Step 1: Create `.dockerignore`**

```
backend/target/
frontend/node_modules/
frontend/dist/
.env
.env.local
uploads/
test-results/
playwright-report/
.git/
vendor/ocr-rs/3rd_party/MNN/
```

**Step 2: Create `Dockerfile`**

```dockerfile
# Stage 1: Build frontend
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# Stage 2: Build backend
FROM rust:1.93.1-bookworm AS backend-build
WORKDIR /app

# Install system deps for ocr-rs (MNN C++ build)
RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    libclang-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY backend/Cargo.toml backend/Cargo.lock ./backend/
COPY vendor/ ./vendor/

# Create a dummy main.rs to build dependencies
RUN mkdir -p backend/src && \
    echo "fn main() {}" > backend/src/main.rs && \
    mkdir -p backend/migrations

# Copy sqlx offline data and migrations (needed at compile time)
COPY backend/.sqlx/ ./backend/.sqlx/
COPY backend/migrations/ ./backend/migrations/

# Build dependencies only (cached layer)
ENV SQLX_OFFLINE=true
RUN cd backend && cargo build --release 2>/dev/null || true

# Now copy actual source and build
COPY backend/src/ ./backend/src/
RUN touch backend/src/main.rs && cd backend && cargo build --release

# Stage 3: Runtime
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy backend binary
COPY --from=backend-build /app/backend/target/release/meemi-backend /app/meemi-backend

# Copy frontend static files
COPY --from=frontend-build /app/frontend/dist /app/static

# Copy OCR models
COPY backend/models/ /app/models/

ENV STATIC_DIR=/app/static
ENV MODEL_DIR=/app/models
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["/app/meemi-backend"]
```

**Step 3: Test the Docker build locally (optional)**

```bash
docker build -t meemi-kansio .
```

This will take a while on first build due to the MNN C++ compilation. Verify it completes successfully.

**Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add multi-stage Dockerfile for production build"
```

---

### Task 7: Make e2e test infrastructure CI-compatible

The test server needs to support using a pre-built binary (from CI artifact) instead of building from source.

**Files:**
- Modify: `frontend/e2e/test-server.ts`
- Modify: `frontend/playwright.config.ts`

**Step 1: Add `BACKEND_BINARY` env var to test-server.ts**

In `test-server.ts`, make the binary path configurable:

```typescript
const BACKEND_BINARY = process.env.BACKEND_BINARY || resolve(BACKEND_DIR, 'target/debug/meemi-backend');
```

Use `BACKEND_BINARY` in both `prepareTemplateDatabase()` and `spawnBackend()` instead of the hardcoded `resolve(BACKEND_DIR, 'target/debug/meemi-backend')`.

In `prepareTemplateDatabase()`:
```typescript
const binaryPath = BACKEND_BINARY;
```

In `spawnBackend()`:
```typescript
const child = spawn(BACKEND_BINARY, [], { ... });
```

When `BACKEND_BINARY` is set, also skip the backend build in the build step (frontend build may still be needed). Update the build logic:

```typescript
if (!SKIP_BUILD) {
    buildFrontend();
    if (!process.env.BACKEND_BINARY) {
        buildBackend();
    }
}
```

**Step 2: Adjust worker count for CI in playwright.config.ts**

Update the webServer command to respect CI worker count:

```typescript
const WORKERS = process.env.CI ? 1 : 4;

// ...

webServer: {
    command: `TEST_INSTANCES=${WORKERS} node e2e/test-server.ts`,
    // ...
}
```

This is already partially handled since `workers` is set to 1 in CI, but the `TEST_INSTANCES` in the webServer command was always 4. Align them.

**Step 3: Run e2e tests locally to verify nothing broke**

```bash
cd frontend && pnpm test:e2e
```

**Step 4: Commit**

```bash
git add frontend/e2e/test-server.ts frontend/playwright.config.ts
git commit -m "feat: make e2e test server configurable for CI"
```

---

### Task 8: OpenTofu infrastructure

Create the infrastructure-as-code files. These can't be tested without actual Scaleway/AWS credentials, so the goal is to get them syntactically valid with `tofu validate`.

**Files:**
- Create: `infra/main.tf`
- Create: `infra/variables.tf`
- Create: `infra/registry.tf`
- Create: `infra/storage.tf`
- Create: `infra/containers.tf`
- Create: `infra/dns.tf`
- Create: `infra/outputs.tf`

**Step 1: Create `infra/main.tf`**

```hcl
terraform {
  required_version = ">= 1.6"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.41"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket                      = "meemit-tofu-state"
    key                         = "terraform.tfstate"
    region                      = "fr-par"
    endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "scaleway" {
  region = var.scaleway_region
}

provider "aws" {
  region = "eu-north-1"
}
```

Note: The state bucket `meemit-tofu-state` must be created manually before first `tofu init`. Use the Scaleway console or CLI:
```bash
scw object bucket create name=meemit-tofu-state region=fr-par
```

**Step 2: Create `infra/variables.tf`**

```hcl
variable "scaleway_region" {
  type    = string
  default = "fr-par"
}

variable "image_tag" {
  type        = string
  description = "Docker image tag (git SHA) to deploy"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "s3_access_key_id" {
  type      = string
  sensitive = true
}

variable "s3_secret_access_key" {
  type      = string
  sensitive = true
}

variable "route53_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID for mainittu.fi"
}
```

**Step 3: Create `infra/registry.tf`**

```hcl
resource "scaleway_registry_namespace" "main" {
  name      = "meemit"
  region    = var.scaleway_region
  is_public = false
}
```

**Step 4: Create `infra/storage.tf`**

```hcl
resource "scaleway_object_bucket" "media" {
  name   = "meemit-media"
  region = var.scaleway_region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://meemit.mainittu.fi"]
    max_age_seconds = 3600
  }
}

resource "scaleway_object_bucket_acl" "media" {
  bucket = scaleway_object_bucket.media.id
  acl    = "public-read"
}
```

**Step 5: Create `infra/containers.tf`**

```hcl
resource "scaleway_container_namespace" "main" {
  name   = "meemit"
  region = var.scaleway_region
}

resource "scaleway_container" "backend" {
  namespace_id = scaleway_container_namespace.main.id
  name         = "meemit-backend"
  description  = "meemi_kansio backend + frontend"

  registry_image = "${scaleway_registry_namespace.main.endpoint}/meemit-backend:${var.image_tag}"

  port         = 3000
  cpu_limit    = 1000
  memory_limit = 1024
  min_scale    = 0
  max_scale    = 1
  timeout      = 300
  privacy      = "public"

  environment_variables = {
    STORAGE_BACKEND = "s3"
    S3_BUCKET       = scaleway_object_bucket.media.name
    S3_REGION       = var.scaleway_region
    S3_ENDPOINT     = "https://s3.${var.scaleway_region}.scw.cloud"
    STATIC_DIR      = "/app/static"
    MODEL_DIR       = "/app/models"
    HOST            = "0.0.0.0"
    PORT            = "3000"
  }

  secret_environment_variables = {
    DATABASE_URL         = var.database_url
    JWT_SECRET           = var.jwt_secret
    S3_ACCESS_KEY_ID     = var.s3_access_key_id
    S3_SECRET_ACCESS_KEY = var.s3_secret_access_key
  }
}
```

**Step 6: Create `infra/dns.tf`**

```hcl
resource "aws_route53_record" "meemit" {
  zone_id = var.route53_zone_id
  name    = "meemit.mainittu.fi"
  type    = "CNAME"
  ttl     = 300
  records = [scaleway_container.backend.domain_name]
}
```

**Step 7: Create `infra/outputs.tf`**

```hcl
output "container_url" {
  value = scaleway_container.backend.domain_name
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "media_bucket_endpoint" {
  value = "https://s3.${var.scaleway_region}.scw.cloud/${scaleway_object_bucket.media.name}"
}
```

**Step 8: Validate**

```bash
cd infra && tofu init -backend=false && tofu validate
```

Use `-backend=false` since we don't have the state bucket credentials locally.

**Step 9: Commit**

```bash
git add infra/
git commit -m "feat: add OpenTofu infrastructure for Scaleway + Route 53"
```

---

### Task 9: GitHub Actions CI workflow

Create the CI pipeline that runs on every push to master.

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master]

env:
  REGISTRY: ${{ secrets.SCW_REGISTRY_ENDPOINT }}
  IMAGE_NAME: meemit-backend

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: meemi
          POSTGRES_PASSWORD: meemi
          POSTGRES_DB: meemi
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y cmake clang libclang-dev pkg-config ffmpeg

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: "1.93.1"

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "backend -> target"

      - name: Run tests
        working-directory: backend
        env:
          DATABASE_URL: postgres://meemi:meemi@localhost:5432/meemi
        run: cargo test

      - name: Build release binary
        working-directory: backend
        env:
          SQLX_OFFLINE: "true"
        run: cargo build --release

      - name: Upload backend binary
        uses: actions/upload-artifact@v4
        with:
          name: meemi-backend
          path: backend/target/release/meemi-backend
          retention-days: 1

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        working-directory: frontend
        run: pnpm install --frozen-lockfile

      - name: Type check
        working-directory: frontend
        run: pnpm exec tsc --noEmit

  test-e2e:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: meemi
          POSTGRES_PASSWORD: meemi
          POSTGRES_DB: meemi
        ports:
          - 5499:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Install ffmpeg
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install frontend dependencies
        working-directory: frontend
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        working-directory: frontend
        run: pnpm exec playwright install --with-deps chromium

      - name: Download backend binary
        uses: actions/download-artifact@v4
        with:
          name: meemi-backend
          path: backend/target/release/

      - name: Make binary executable
        run: chmod +x backend/target/release/meemi-backend

      - name: Run e2e tests
        working-directory: frontend
        env:
          CI: "true"
          BACKEND_BINARY: ${{ github.workspace }}/backend/target/release/meemi-backend
          SKIP_BUILD: "1"
        run: pnpm test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 7

  build-and-publish:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend, test-e2e]
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Login to Scaleway Container Registry
        uses: docker/login-action@v3
        with:
          registry: rg.fr-par.scw.cloud
          username: nologin
          password: ${{ secrets.SCW_SECRET_KEY }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            rg.fr-par.scw.cloud/${{ secrets.SCW_REGISTRY_NAMESPACE }}/meemit-backend:${{ github.sha }}
            rg.fr-par.scw.cloud/${{ secrets.SCW_REGISTRY_NAMESPACE }}/meemit-backend:latest
          cache-from: type=registry,ref=rg.fr-par.scw.cloud/${{ secrets.SCW_REGISTRY_NAMESPACE }}/meemit-backend:buildcache
          cache-to: type=registry,ref=rg.fr-par.scw.cloud/${{ secrets.SCW_REGISTRY_NAMESPACE }}/meemit-backend:buildcache,mode=max

  pre-release:
    runs-on: ubuntu-latest
    needs: [build-and-publish]
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Create pre-release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "${{ github.sha }}" \
            --prerelease \
            --title "Build ${{ github.sha }}" \
            --notes "Docker image: \`rg.fr-par.scw.cloud/${{ secrets.SCW_REGISTRY_NAMESPACE }}/meemit-backend:${{ github.sha }}\`"
```

Note: `SCW_REGISTRY_NAMESPACE` is a non-sensitive secret containing the registry namespace ID (UUID). Set it in GitHub Actions secrets after running `tofu apply` for the first time (the output `registry_endpoint` contains this value).

**Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "feat: add GitHub Actions CI workflow"
```

---

### Task 10: GitHub Actions Deploy workflow

Create the deployment workflow triggered by release promotion.

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  release:
    types: [released]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Install OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          tofu_version: "1.9"

      - name: Initialize OpenTofu
        working-directory: infra
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.SCW_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SCW_SECRET_KEY }}
        run: tofu init

      - name: Apply infrastructure
        working-directory: infra
        env:
          # State backend auth (Scaleway S3)
          AWS_ACCESS_KEY_ID: ${{ secrets.SCW_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SCW_SECRET_KEY }}
          # Scaleway provider auth
          SCW_ACCESS_KEY: ${{ secrets.SCW_ACCESS_KEY }}
          SCW_SECRET_KEY: ${{ secrets.SCW_SECRET_KEY }}
          # OpenTofu variables
          TF_VAR_image_tag: ${{ github.event.release.tag_name }}
          TF_VAR_database_url: ${{ secrets.DATABASE_URL }}
          TF_VAR_jwt_secret: ${{ secrets.JWT_SECRET }}
          TF_VAR_s3_access_key_id: ${{ secrets.S3_ACCESS_KEY_ID }}
          TF_VAR_s3_secret_access_key: ${{ secrets.S3_SECRET_ACCESS_KEY }}
          TF_VAR_route53_zone_id: ${{ secrets.ROUTE53_ZONE_ID }}
          # AWS provider auth (for Route 53)
          # These use different env var names to avoid conflict with Scaleway state backend
        run: |
          tofu apply -auto-approve \
            -var="image_tag=${{ github.event.release.tag_name }}"
```

Note: The AWS provider for Route 53 needs its own credentials. Since `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars are used by the Scaleway state backend, configure the AWS provider to use different env vars or pass credentials via the provider block. Update `infra/main.tf`:

```hcl
provider "aws" {
  region     = "eu-north-1"
  access_key = var.aws_access_key_id
  secret_key = var.aws_secret_access_key
}
```

And add to `variables.tf`:
```hcl
variable "aws_access_key_id" {
  type      = string
  sensitive = true
}

variable "aws_secret_access_key" {
  type      = string
  sensitive = true
}
```

And add to the deploy workflow:
```yaml
TF_VAR_aws_access_key_id: ${{ secrets.AWS_ACCESS_KEY_ID }}
TF_VAR_aws_secret_access_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions deploy workflow"
```

---

## Post-implementation manual steps

These steps require credentials and can't be automated in the codebase:

1. **Create Scaleway API keys** in the Scaleway console
2. **Bootstrap the state bucket**: `scw object bucket create name=meemit-tofu-state region=fr-par`
3. **Run initial `tofu apply`** to create all resources (registry, container, bucket, DNS)
4. **Set GitHub Actions secrets**: `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_REGISTRY_NAMESPACE`, `DATABASE_URL`, `JWT_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ROUTE53_ZONE_ID`
5. **Create a Supabase project** and get the PostgreSQL connection string
6. **Push to master** to trigger the first CI run
7. **Promote the pre-release** to trigger the first deployment
