use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::tag::Tag;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/tags", get(search_tags))
}

#[derive(Debug, Deserialize)]
struct SearchTagsParams {
    q: Option<String>,
}

#[derive(Debug, Serialize)]
struct SearchTagsResponse {
    tags: Vec<Tag>,
}

async fn search_tags(
    State(state): State<AppState>,
    _auth: AuthUser,
    Query(params): Query<SearchTagsParams>,
) -> Result<Json<SearchTagsResponse>, AppError> {
    let q = params.q.unwrap_or_default().trim().to_lowercase();

    let tags = if q.is_empty() {
        // Return most-used tags
        sqlx::query_as::<_, Tag>(
            "SELECT t.id, t.name FROM tags t
             JOIN media_tags mt ON mt.tag_id = t.id
             GROUP BY t.id, t.name
             ORDER BY COUNT(*) DESC
             LIMIT 10",
        )
        .fetch_all(&state.db)
        .await?
    } else {
        // Prefix search
        sqlx::query_as::<_, Tag>(
            "SELECT id, name FROM tags WHERE name LIKE $1 ORDER BY name LIMIT 10",
        )
        .bind(format!("{q}%"))
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(SearchTagsResponse { tags }))
}
