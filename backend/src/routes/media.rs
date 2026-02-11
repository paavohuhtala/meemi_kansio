use std::path::Path;

use axum::extract::{DefaultBodyLimit, Multipart, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use tower_http::services::ServeDir;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::media::{Media, MediaResponse, MediaType};
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

pub fn router(upload_dir: &str) -> Router<AppState> {
    Router::new()
        .route("/api/media/upload", post(upload))
        .route_layer(DefaultBodyLimit::max(MAX_UPLOAD_SIZE))
        .route("/api/media/{id}", get(get_media))
        .nest_service("/api/files", ServeDir::new(upload_dir))
}

async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, AppError> {
    let mut file_data: Option<(String, Vec<u8>)> = None;
    let mut name: Option<String> = None;
    let mut description: Option<String> = None;

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

    // Filter empty strings to None
    let name = name.filter(|s| !s.trim().is_empty());
    let description = description.filter(|s| !s.trim().is_empty());

    let media = sqlx::query_as::<_, Media>(
        "INSERT INTO media (name, description, media_type, file_path, file_size, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(&name)
    .bind(&description)
    .bind(&media_type)
    .bind(&file_name)
    .bind(file_size)
    .bind(&mime)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(media.into_response()))
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

    Ok(Json(media.into_response()))
}
