use std::collections::HashMap;
use std::io::Cursor;

use axum::extract::{DefaultBodyLimit, Multipart, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::media::{Media, MediaListResponse, MediaResponse, MediaType};
use crate::AppState;

const ALLOWED_MIME_TYPES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
];

fn media_type_from_mime(mime: &str) -> Option<MediaType> {
    match mime {
        "image/gif" => Some(MediaType::Gif),
        m if m.starts_with("image/") => Some(MediaType::Image),
        m if m.starts_with("video/") => Some(MediaType::Video),
        _ => None,
    }
}

fn extension_from_mime(mime: &str) -> &str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/quicktime" => "mov",
        _ => "bin",
    }
}

const MAX_UPLOAD_SIZE: usize = 50 * 1024 * 1024; // 50 MB

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/media/upload", post(upload))
        .route("/api/media/{id}/file", put(replace_file))
        .route_layer(DefaultBodyLimit::max(MAX_UPLOAD_SIZE))
        .route("/api/media", get(list_media))
        .route(
            "/api/media/{id}",
            get(get_media).patch(update_media).delete(delete_media),
        )
        .route("/api/media/{id}/tags", put(set_tags))
        .route("/api/media/{id}/regenerate-thumbnail", post(regenerate_thumbnail))
        .route("/api/media/{id}/run-ocr", post(run_ocr))
}

fn extract_image_dimensions(bytes: &[u8]) -> Option<(i32, i32)> {
    let reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let (w, h) = reader.into_dimensions().ok()?;
    Some((w as i32, h as i32))
}

// --- Tag helpers ---

fn validate_tag(name: &str) -> Result<String, AppError> {
    let normalized = name.trim().to_lowercase();
    if normalized.is_empty() || normalized.chars().count() > 30 {
        return Err(AppError::BadRequest(
            "Tag must be 1-30 characters".into(),
        ));
    }
    if normalized.chars().any(|c| c.is_whitespace()) {
        return Err(AppError::BadRequest(
            "Tags cannot contain whitespace".into(),
        ));
    }
    Ok(normalized)
}

/// Insert tags by name (creating new ones as needed) and link them to a media item.
/// Replaces any existing tags on the media.
async fn link_tags(
    pool: &PgPool,
    media_id: Uuid,
    tag_names: &[String],
) -> Result<Vec<String>, AppError> {
    // Delete existing associations
    sqlx::query("DELETE FROM media_tags WHERE media_id = $1")
        .bind(media_id)
        .execute(pool)
        .await?;

    if tag_names.is_empty() {
        return Ok(vec![]);
    }

    let mut linked: Vec<String> = Vec::with_capacity(tag_names.len());

    for name in tag_names {
        let tag_id: Uuid = sqlx::query_scalar(
            "INSERT INTO tags (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(name)
        .fetch_one(pool)
        .await?;

        sqlx::query("INSERT INTO media_tags (media_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(media_id)
            .bind(tag_id)
            .execute(pool)
            .await?;

        linked.push(name.clone());
    }

    linked.sort();
    Ok(linked)
}

/// Fetch tag names for a single media item.
async fn fetch_tags(pool: &PgPool, media_id: Uuid) -> Result<Vec<String>, AppError> {
    let tags: Vec<(String,)> = sqlx::query_as(
        "SELECT t.name FROM tags t
         JOIN media_tags mt ON mt.tag_id = t.id
         WHERE mt.media_id = $1
         ORDER BY t.name",
    )
    .bind(media_id)
    .fetch_all(pool)
    .await?;

    Ok(tags.into_iter().map(|(n,)| n).collect())
}

/// Batch-fetch tag names for multiple media items.
async fn fetch_tags_batch(
    pool: &PgPool,
    media_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<String>>, AppError> {
    if media_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT mt.media_id, t.name FROM tags t
         JOIN media_tags mt ON mt.tag_id = t.id
         WHERE mt.media_id = ANY($1)
         ORDER BY t.name",
    )
    .bind(media_ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<Uuid, Vec<String>> = HashMap::new();
    for (media_id, name) in rows {
        map.entry(media_id).or_default().push(name);
    }
    Ok(map)
}

// --- Handlers ---

async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, AppError> {
    let mut file_data: Option<(String, Vec<u8>)> = None;
    let mut name: Option<String> = None;
    let mut description: Option<String> = None;
    let mut tags_json: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {e}")))?
    {
        let field_name = field.name().unwrap_or_default().to_string();

        match field_name.as_str() {
            "file" => {
                let mime = field
                    .content_type()
                    .ok_or_else(|| AppError::BadRequest("File missing content type".into()))?
                    .to_string();

                if !ALLOWED_MIME_TYPES.contains(&mime.as_str()) {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported file type: {mime}"
                    )));
                }

                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Failed to read file: {e}")))?;

                file_data = Some((mime, bytes.to_vec()));
            }
            "name" => {
                name = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(format!("Failed to read name: {e}")))?,
                );
            }
            "description" => {
                description = Some(
                    field.text().await.map_err(|e| {
                        AppError::BadRequest(format!("Failed to read description: {e}"))
                    })?,
                );
            }
            "tags" => {
                tags_json = Some(
                    field.text().await.map_err(|e| {
                        AppError::BadRequest(format!("Failed to read tags: {e}"))
                    })?,
                );
            }
            _ => {}
        }
    }

    let (mime, bytes) = file_data.ok_or_else(|| AppError::BadRequest("No file provided".into()))?;

    let media_type =
        media_type_from_mime(&mime).ok_or_else(|| AppError::BadRequest("Unknown media type".into()))?;

    let ext = extension_from_mime(&mime);
    let file_name = format!("{}.{ext}", Uuid::new_v4());
    let file_size = bytes.len() as i64;

    // Store the file via the storage backend
    state.storage.put(&file_name, &bytes, &mime).await?;

    // Extract dimensions
    let (width, height) = if media_type != MediaType::Video {
        extract_image_dimensions(&bytes)
            .map(|(w, h)| (Some(w), Some(h)))
            .unwrap_or((None, None))
    } else {
        // Write to a temp file for ffprobe
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let tmp_path = tmp_dir.path().join(&file_name);
        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;
        match crate::video::probe_dimensions(&tmp_path).await {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(e) => {
                tracing::warn!("Video dimension extraction failed: {e}");
                (None, None)
            }
        }
        // tmp_dir drops here, cleaning up
    };

    // Generate thumbnails (best-effort)
    let thumb_stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| file_name.clone());

    if media_type != MediaType::Video {
        let bytes_clone = bytes.clone();
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&bytes_clone)
        })
        .await;
        match result {
            Ok(Ok((thumb_bytes, clipboard_bytes))) => {
                let thumb_key = format!("{thumb_stem}_thumb.webp");
                let clipboard_key = format!("{thumb_stem}_clipboard.png");
                if let Err(e) = state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await {
                    tracing::warn!("Failed to store thumbnail: {e}");
                }
                if let Err(e) = state.storage.put(&clipboard_key, &clipboard_bytes, "image/png").await {
                    tracing::warn!("Failed to store clipboard image: {e}");
                }
            }
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }
    } else {
        // Video: write to temp file for FFmpeg frame extraction
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let tmp_path = tmp_dir.path().join(&file_name);
        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;
        match crate::video::extract_frame(&tmp_path).await {
            Ok(frame_bytes) => {
                let result = tokio::task::spawn_blocking(move || {
                    crate::thumbnails::generate_gallery_thumb(&frame_bytes)
                })
                .await;
                match result {
                    Ok(Ok(thumb_bytes)) => {
                        let thumb_key = format!("{thumb_stem}_thumb.webp");
                        if let Err(e) = state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await {
                            tracing::warn!("Failed to store video thumbnail: {e}");
                        }
                    }
                    Ok(Err(e)) => tracing::warn!("Video thumbnail generation failed: {e}"),
                    Err(e) => tracing::warn!("Video thumbnail task panicked: {e}"),
                }
            }
            Err(e) => tracing::warn!("Video frame extraction failed: {e}"),
        }
    }

    // Filter empty strings to None
    let name = name.filter(|s| !s.trim().is_empty());
    let description = description.filter(|s| !s.trim().is_empty());

    let media = sqlx::query_as::<_, Media>(
        "INSERT INTO media (name, description, media_type, file_path, file_size, mime_type, width, height, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *",
    )
    .bind(&name)
    .bind(&description)
    .bind(&media_type)
    .bind(&file_name)
    .bind(file_size)
    .bind(&mime)
    .bind(width)
    .bind(height)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    // Handle tags if provided
    let tags = if let Some(json) = tags_json {
        let raw_tags: Vec<String> = serde_json::from_str(&json)
            .map_err(|e| AppError::BadRequest(format!("Invalid tags JSON: {e}")))?;
        let validated: Vec<String> = raw_tags.iter().map(|t| validate_tag(t)).collect::<Result<_, _>>()?;
        link_tags(&state.db, media.id, &validated).await?
    } else {
        vec![]
    };

    // Spawn background OCR task
    if let Some(ref ocr_engine) = state.ocr {
        let ocr_bytes = if media_type == MediaType::Video {
            let thumb_key = format!("{thumb_stem}_thumb.webp");
            state.storage.get(&thumb_key).await.ok()
        } else {
            Some(bytes)
        };
        if let Some(ocr_bytes) = ocr_bytes {
            crate::ocr::spawn_ocr_task(ocr_engine.clone(), state.db.clone(), media.id, ocr_bytes);
        }
    }

    Ok(Json(media.into_response(tags, &state.storage)))
}

async fn get_media(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<MediaResponse>, AppError> {
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

#[derive(Debug, Deserialize)]
struct UpdateMediaRequest {
    name: Option<String>,
    description: Option<String>,
    ocr_text: Option<String>,
}

async fn update_media(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    Json(body): Json<UpdateMediaRequest>,
) -> Result<Json<MediaResponse>, AppError> {
    let has_name = body.name.is_some();
    let has_description = body.description.is_some();
    let has_ocr_text = body.ocr_text.is_some();
    let name = body.name.filter(|s| !s.trim().is_empty());
    let description = body.description.filter(|s| !s.trim().is_empty());
    let ocr_text = body.ocr_text.filter(|s| !s.trim().is_empty());

    let media = sqlx::query_as::<_, Media>(
        "UPDATE media SET
           name = CASE WHEN $1 THEN $2 ELSE name END,
           description = CASE WHEN $3 THEN $4 ELSE description END,
           ocr_text = CASE WHEN $5 THEN $6 ELSE ocr_text END,
           updated_at = NOW()
         WHERE id = $7 RETURNING *",
    )
    .bind(has_name)
    .bind(&name)
    .bind(has_description)
    .bind(&description)
    .bind(has_ocr_text)
    .bind(&ocr_text)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

async fn replace_file(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, AppError> {
    let mut file_data: Option<(String, Vec<u8>)> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {e}")))?
    {
        if field.name() == Some("file") {
            let mime = field
                .content_type()
                .ok_or_else(|| AppError::BadRequest("File missing content type".into()))?
                .to_string();

            if !ALLOWED_MIME_TYPES.contains(&mime.as_str()) {
                return Err(AppError::BadRequest(format!(
                    "Unsupported file type: {mime}"
                )));
            }

            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed to read file: {e}")))?;

            file_data = Some((mime, bytes.to_vec()));
        }
    }

    let (mime, bytes) =
        file_data.ok_or_else(|| AppError::BadRequest("No file provided".into()))?;

    // Get existing media to find old file path
    let old_media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    let media_type = media_type_from_mime(&mime)
        .ok_or_else(|| AppError::BadRequest("Unknown media type".into()))?;

    let ext = extension_from_mime(&mime);
    let file_name = format!("{}.{ext}", Uuid::new_v4());
    let file_size = bytes.len() as i64;

    // Store the new file via the storage backend
    state.storage.put(&file_name, &bytes, &mime).await?;

    // Extract dimensions
    let (width, height) = if media_type != MediaType::Video {
        extract_image_dimensions(&bytes)
            .map(|(w, h)| (Some(w), Some(h)))
            .unwrap_or((None, None))
    } else {
        // Write to a temp file for ffprobe
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let tmp_path = tmp_dir.path().join(&file_name);
        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;
        match crate::video::probe_dimensions(&tmp_path).await {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(e) => {
                tracing::warn!("Video dimension extraction failed: {e}");
                (None, None)
            }
        }
    };

    // Delete old file and thumbnails via storage backend (best-effort)
    state.storage.delete(&old_media.file_path).await;
    for key in crate::thumbnails::thumbnail_keys(&old_media.file_path) {
        state.storage.delete(&key).await;
    }

    // Generate thumbnails (best-effort)
    let thumb_stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| file_name.clone());

    if media_type != MediaType::Video {
        let bytes_clone = bytes.clone();
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&bytes_clone)
        })
        .await;
        match result {
            Ok(Ok((thumb_bytes, clipboard_bytes))) => {
                let thumb_key = format!("{thumb_stem}_thumb.webp");
                let clipboard_key = format!("{thumb_stem}_clipboard.png");
                if let Err(e) = state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await {
                    tracing::warn!("Failed to store thumbnail: {e}");
                }
                if let Err(e) = state.storage.put(&clipboard_key, &clipboard_bytes, "image/png").await {
                    tracing::warn!("Failed to store clipboard image: {e}");
                }
            }
            Ok(Err(e)) => tracing::warn!("Thumbnail generation failed: {e}"),
            Err(e) => tracing::warn!("Thumbnail task panicked: {e}"),
        }
    } else {
        // Video: write to temp file for FFmpeg frame extraction
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let tmp_path = tmp_dir.path().join(&file_name);
        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;
        match crate::video::extract_frame(&tmp_path).await {
            Ok(frame_bytes) => {
                let result = tokio::task::spawn_blocking(move || {
                    crate::thumbnails::generate_gallery_thumb(&frame_bytes)
                })
                .await;
                match result {
                    Ok(Ok(thumb_bytes)) => {
                        let thumb_key = format!("{thumb_stem}_thumb.webp");
                        if let Err(e) = state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await {
                            tracing::warn!("Failed to store video thumbnail: {e}");
                        }
                    }
                    Ok(Err(e)) => tracing::warn!("Video thumbnail generation failed: {e}"),
                    Err(e) => tracing::warn!("Video thumbnail task panicked: {e}"),
                }
            }
            Err(e) => tracing::warn!("Video frame extraction failed: {e}"),
        }
    }

    let media = sqlx::query_as::<_, Media>(
        "UPDATE media SET file_path = $1, file_size = $2, mime_type = $3, media_type = $4,
         width = $5, height = $6, ocr_text = NULL, updated_at = NOW()
         WHERE id = $7 RETURNING *",
    )
    .bind(&file_name)
    .bind(file_size)
    .bind(&mime)
    .bind(&media_type)
    .bind(width)
    .bind(height)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Spawn background OCR task for the new file
    if let Some(ref ocr_engine) = state.ocr {
        let ocr_bytes = if media_type == MediaType::Video {
            let thumb_key = format!("{thumb_stem}_thumb.webp");
            state.storage.get(&thumb_key).await.ok()
        } else {
            Some(bytes)
        };
        if let Some(ocr_bytes) = ocr_bytes {
            crate::ocr::spawn_ocr_task(ocr_engine.clone(), state.db.clone(), media.id, ocr_bytes);
        }
    }

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

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

    // Delete file and thumbnails via storage backend (best-effort)
    state.storage.delete(&media.file_path).await;
    for key in crate::thumbnails::thumbnail_keys(&media.file_path) {
        state.storage.delete(&key).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn regenerate_thumbnail(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<MediaResponse>, AppError> {
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    // Delete existing thumbnails
    for key in crate::thumbnails::thumbnail_keys(&media.file_path) {
        state.storage.delete(&key).await;
    }

    let thumb_stem = media
        .file_path
        .rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| media.file_path.clone());

    // Regenerate
    if media.media_type != MediaType::Video {
        let bytes = state.storage.get(&media.file_path).await?;
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&bytes)
        })
        .await;
        match result {
            Ok(Ok((thumb_bytes, clipboard_bytes))) => {
                let thumb_key = format!("{thumb_stem}_thumb.webp");
                let clipboard_key = format!("{thumb_stem}_clipboard.png");
                state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await?;
                state.storage.put(&clipboard_key, &clipboard_bytes, "image/png").await?;
            }
            Ok(Err(e)) => return Err(AppError::Internal(format!("Thumbnail generation failed: {e}"))),
            Err(e) => return Err(AppError::Internal(format!("Thumbnail task panicked: {e}"))),
        }
    } else {
        // Video: write to temp file for FFmpeg frame extraction
        let bytes = state.storage.get(&media.file_path).await?;
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {e}")))?;
        let tmp_path = tmp_dir.path().join(&media.file_path);
        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write temp file: {e}")))?;
        match crate::video::extract_frame(&tmp_path).await {
            Ok(frame_bytes) => {
                let result = tokio::task::spawn_blocking(move || {
                    crate::thumbnails::generate_gallery_thumb(&frame_bytes)
                })
                .await;
                match result {
                    Ok(Ok(thumb_bytes)) => {
                        let thumb_key = format!("{thumb_stem}_thumb.webp");
                        state.storage.put(&thumb_key, &thumb_bytes, "image/webp").await?;
                    }
                    Ok(Err(e)) => return Err(AppError::Internal(format!("Video thumbnail generation failed: {e}"))),
                    Err(e) => return Err(AppError::Internal(format!("Video thumbnail task panicked: {e}"))),
                }
            }
            Err(e) => return Err(AppError::Internal(format!("Video frame extraction failed: {e}"))),
        }
    }

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

async fn run_ocr(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<MediaResponse>, AppError> {
    let ocr_engine = state
        .ocr
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("OCR is not available".into()))?;

    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    let ocr_key = if media.media_type == MediaType::Video {
        let stem = media
            .file_path
            .rsplit_once('.')
            .map(|(s, _)| s)
            .unwrap_or(&media.file_path);
        format!("{stem}_thumb.webp")
    } else {
        media.file_path.clone()
    };

    let bytes = state.storage.get(&ocr_key).await
        .map_err(|e| AppError::Internal(format!("Failed to read file for OCR: {e}")))?;

    let engine = ocr_engine.clone();
    let ocr_text = tokio::task::spawn_blocking(move || crate::ocr::recognize(&engine, &bytes))
        .await
        .map_err(|e| AppError::Internal(format!("OCR task panicked: {e}")))?;

    let media = sqlx::query_as::<_, Media>(
        "UPDATE media SET ocr_text = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    )
    .bind(&ocr_text)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

#[derive(Debug, Deserialize)]
struct SetTagsRequest {
    tags: Vec<String>,
}

async fn set_tags(
    State(state): State<AppState>,
    _auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    Json(body): Json<SetTagsRequest>,
) -> Result<Json<MediaResponse>, AppError> {
    // Verify media exists
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Media not found".into()))?;

    let validated: Vec<String> = body
        .tags
        .iter()
        .map(|t| validate_tag(t))
        .collect::<Result<_, _>>()?;

    let tags = link_tags(&state.db, media.id, &validated).await?;
    Ok(Json(media.into_response(tags, &state.storage)))
}

#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,
}

async fn list_media(
    State(state): State<AppState>,
    _auth: AuthUser,
    Query(params): Query<ListMediaParams>,
) -> Result<Json<MediaListResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).min(50);

    // Parse tag filter
    let tag_filter: Vec<String> = params
        .tags
        .map(|t| {
            t.split(',')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let rows = if tag_filter.is_empty() {
        let mut sql = String::from("SELECT * FROM media WHERE 1=1");
        if params.media_type.is_some() {
            sql.push_str(" AND media_type = $1");
        }
        if params.cursor.is_some() {
            let n = if params.media_type.is_some() { "$2" } else { "$1" };
            sql.push_str(&format!(" AND created_at < {n}"));
        }
        let limit_n = match (params.media_type.is_some(), params.cursor.is_some()) {
            (true, true) => "$3",
            (true, false) | (false, true) => "$2",
            (false, false) => "$1",
        };
        sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {limit_n}"));

        let mut q = sqlx::query_as::<_, Media>(&sql);
        if let Some(ref mt) = params.media_type {
            q = q.bind(mt);
        }
        if let Some(cursor) = params.cursor {
            q = q.bind(cursor);
        }
        q = q.bind(limit + 1);
        q.fetch_all(&state.db).await?
    } else {
        let tag_count = tag_filter.len() as i64;
        // $1 = tags array, next params are dynamic
        let mut next_param = 2;
        let mut extra_where = String::new();
        if params.media_type.is_some() {
            extra_where.push_str(&format!(" AND m.media_type = ${next_param}"));
            next_param += 1;
        }
        if params.cursor.is_some() {
            extra_where.push_str(&format!(" AND m.created_at < ${next_param}"));
            next_param += 1;
        }
        let sql = format!(
            "SELECT m.* FROM media m
             JOIN media_tags mt ON mt.media_id = m.id
             JOIN tags t ON t.id = mt.tag_id
             WHERE t.name = ANY($1){extra_where}
             GROUP BY m.id
             HAVING COUNT(DISTINCT t.name) = ${next_param}
             ORDER BY m.created_at DESC
             LIMIT ${}", next_param + 1
        );

        let mut q = sqlx::query_as::<_, Media>(&sql);
        q = q.bind(&tag_filter);
        if let Some(ref mt) = params.media_type {
            q = q.bind(mt);
        }
        if let Some(cursor) = params.cursor {
            q = q.bind(cursor);
        }
        q = q.bind(tag_count);
        q = q.bind(limit + 1);
        q.fetch_all(&state.db).await?
    };

    let has_more = rows.len() as i64 > limit;
    let items: Vec<_> = rows
        .into_iter()
        .take(limit as usize)
        .collect::<Vec<_>>();

    let next_cursor = if has_more {
        items.last().map(|m| m.created_at)
    } else {
        None
    };

    // Batch-fetch tags for all items in the page
    let media_ids: Vec<Uuid> = items.iter().map(|m| m.id).collect();
    let mut tags_map = fetch_tags_batch(&state.db, &media_ids).await?;

    Ok(Json(MediaListResponse {
        items: items
            .into_iter()
            .map(|m| {
                let tags = tags_map.remove(&m.id).unwrap_or_default();
                m.into_response(tags, &state.storage)
            })
            .collect(),
        next_cursor,
    }))
}
