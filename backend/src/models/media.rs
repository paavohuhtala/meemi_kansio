use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::storage::StorageBackend;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "media_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Image,
    Video,
    Gif,
}

#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)]
pub struct Media {
    pub id: Uuid,
    pub name: Option<String>,
    pub description: Option<String>,
    pub media_type: MediaType,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub source_url: Option<String>,
    pub thumbnail_path: Option<String>,
    pub ocr_text: Option<String>,
    pub uploaded_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MediaResponse {
    pub id: Uuid,
    pub name: Option<String>,
    pub description: Option<String>,
    pub media_type: MediaType,
    pub file_url: String,
    pub thumbnail_url: Option<String>,
    pub clipboard_url: Option<String>,
    pub file_size: i64,
    pub mime_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub ocr_text: Option<String>,
    pub uploaded_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MediaListResponse {
    pub items: Vec<MediaResponse>,
    pub next_cursor: Option<DateTime<Utc>>,
}

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
