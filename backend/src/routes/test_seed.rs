use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::media::Media;
use crate::AppState;

#[derive(Deserialize)]
struct SeedMediaRequest {
    count: u32,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/test/seed-media", post(seed_media))
}

async fn seed_media(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SeedMediaRequest>,
) -> Result<StatusCode, AppError> {
    if body.count == 0 || body.count > 200 {
        return Err(AppError::BadRequest(
            "count must be between 1 and 200".into(),
        ));
    }

    for i in 1..=body.count {
        let name = format!("item-{i:03}");
        let offset_minutes = (i - 1) as i32;

        sqlx::query_as::<_, Media>(
            "INSERT INTO media (name, media_type, file_path, file_size, mime_type, width, height, uploaded_by, created_at)
             VALUES ($1, 'image', 'test/placeholder.jpg', 0, 'image/jpeg', 800, 600, $2, NOW() - make_interval(mins => $3))
             RETURNING *",
        )
        .bind(&name)
        .bind(auth.user_id)
        .bind(offset_minutes)
        .fetch_one(&state.db)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
