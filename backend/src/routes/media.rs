use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;

use axum::extract::{DefaultBodyLimit, Multipart, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::PgPool;
use tower_http::services::ServeDir;
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

/// Extract a video frame and generate a gallery thumbnail (best-effort).
async fn generate_video_thumbnail(file_path: &Path, upload_dir: &str, file_name: &str) {
    let thumb_stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| file_name.to_string());
    match crate::video::extract_frame(file_path).await {
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

pub fn router(upload_dir: &str) -> Router<AppState> {
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
        .nest_service("/api/files", ServeDir::new(upload_dir))
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

    // Ensure upload directory exists
    let upload_dir = &state.config.upload_dir;
    tokio::fs::create_dir_all(upload_dir)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create upload directory: {e}")))?;

    let file_path = Path::new(upload_dir).join(&file_name);
    let file_size = bytes.len() as i64;

    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

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
        generate_video_thumbnail(&file_path, upload_dir, &file_name).await;
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
        let ocr_file = if media_type == MediaType::Video {
            let stem = file_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&file_name);
            Path::new(upload_dir).join(format!("{stem}_thumb.webp"))
        } else {
            Path::new(upload_dir).join(&file_name)
        };
        crate::ocr::spawn_ocr_task(ocr_engine.clone(), state.db.clone(), media.id, ocr_file);
    }

    Ok(Json(media.into_response(tags)))
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
    Ok(Json(media.into_response(tags)))
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
    Ok(Json(media.into_response(tags)))
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

    let upload_dir = &state.config.upload_dir;
    let file_path = Path::new(upload_dir).join(&file_name);
    let file_size = bytes.len() as i64;

    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

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

    // Delete old file and thumbnails from disk (best-effort)
    let upload_dir_path = Path::new(upload_dir);
    let _ = tokio::fs::remove_file(upload_dir_path.join(&old_media.file_path)).await;
    for thumb_path in crate::thumbnails::thumbnail_paths(upload_dir_path, &old_media.file_path) {
        let _ = tokio::fs::remove_file(&thumb_path).await;
    }

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
        generate_video_thumbnail(&file_path, upload_dir, &file_name).await;
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
        let ocr_file = if media_type == MediaType::Video {
            let stem = file_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&file_name);
            Path::new(upload_dir).join(format!("{stem}_thumb.webp"))
        } else {
            Path::new(upload_dir).join(&file_name)
        };
        crate::ocr::spawn_ocr_task(ocr_engine.clone(), state.db.clone(), media.id, ocr_file);
    }

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags)))
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

    // Delete file and thumbnails from disk (best-effort)
    let upload_dir = Path::new(&state.config.upload_dir);
    let _ = tokio::fs::remove_file(upload_dir.join(&media.file_path)).await;
    for thumb_path in crate::thumbnails::thumbnail_paths(upload_dir, &media.file_path) {
        let _ = tokio::fs::remove_file(&thumb_path).await;
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

    let upload_dir = &state.config.upload_dir;
    let upload_dir_path = Path::new(upload_dir);
    let file_path = upload_dir_path.join(&media.file_path);

    // Delete existing thumbnails
    for thumb_path in crate::thumbnails::thumbnail_paths(upload_dir_path, &media.file_path) {
        let _ = tokio::fs::remove_file(&thumb_path).await;
    }

    // Regenerate
    if media.media_type != MediaType::Video {
        let bytes = tokio::fs::read(&file_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read media file: {e}")))?;
        let thumb_dir = upload_dir.to_string();
        let thumb_stem = media
            .file_path
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| media.file_path.clone());
        let result = tokio::task::spawn_blocking(move || {
            crate::thumbnails::generate(&bytes, Path::new(&thumb_dir), &thumb_stem)
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(AppError::Internal(format!("Thumbnail generation failed: {e}"))),
            Err(e) => return Err(AppError::Internal(format!("Thumbnail task panicked: {e}"))),
        }
    } else {
        generate_video_thumbnail(&file_path, upload_dir, &media.file_path).await;
    }

    let tags = fetch_tags(&state.db, media.id).await?;
    Ok(Json(media.into_response(tags)))
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

    let upload_dir = &state.config.upload_dir;
    let ocr_file = if media.media_type == MediaType::Video {
        let stem = media
            .file_path
            .rsplit_once('.')
            .map(|(s, _)| s)
            .unwrap_or(&media.file_path);
        Path::new(upload_dir).join(format!("{stem}_thumb.webp"))
    } else {
        Path::new(upload_dir).join(&media.file_path)
    };

    let bytes = tokio::fs::read(&ocr_file)
        .await
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
    Ok(Json(media.into_response(tags)))
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
    Ok(Json(media.into_response(tags)))
}

#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
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
        // No tag filter — existing behavior
        if let Some(cursor) = params.cursor {
            sqlx::query_as::<_, Media>(
                "SELECT * FROM media WHERE created_at < $1 ORDER BY created_at DESC LIMIT $2",
            )
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as::<_, Media>("SELECT * FROM media ORDER BY created_at DESC LIMIT $1")
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await?
        }
    } else {
        // Filter by tags (AND logic)
        let tag_count = tag_filter.len() as i64;
        if let Some(cursor) = params.cursor {
            sqlx::query_as::<_, Media>(
                "SELECT m.* FROM media m
                 JOIN media_tags mt ON mt.media_id = m.id
                 JOIN tags t ON t.id = mt.tag_id
                 WHERE t.name = ANY($1) AND m.created_at < $2
                 GROUP BY m.id
                 HAVING COUNT(DISTINCT t.name) = $3
                 ORDER BY m.created_at DESC
                 LIMIT $4",
            )
            .bind(&tag_filter)
            .bind(cursor)
            .bind(tag_count)
            .bind(limit + 1)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as::<_, Media>(
                "SELECT m.* FROM media m
                 JOIN media_tags mt ON mt.media_id = m.id
                 JOIN tags t ON t.id = mt.tag_id
                 WHERE t.name = ANY($1)
                 GROUP BY m.id
                 HAVING COUNT(DISTINCT t.name) = $2
                 ORDER BY m.created_at DESC
                 LIMIT $3",
            )
            .bind(&tag_filter)
            .bind(tag_count)
            .bind(limit + 1)
            .fetch_all(&state.db)
            .await?
        }
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
                m.into_response(tags)
            })
            .collect(),
        next_cursor,
    }))
}
