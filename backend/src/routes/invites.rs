use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use rand::Rng;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::invite::{CreateInviteRequest, Invite};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/invites", post(create_invite).get(list_invites))
}

fn generate_invite_code() -> String {
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| {
            let idx = rng.gen_range(0..36u8);
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect()
}

async fn create_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateInviteRequest>,
) -> Result<Json<Invite>, AppError> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden);
    }

    let code = generate_invite_code();
    let expires_in_hours = body.expires_in_hours.unwrap_or(72) as f64;

    let invite = sqlx::query_as::<_, Invite>(
        "INSERT INTO invites (code, created_by, expires_at)
         VALUES ($1, $2, now() + ($3 || ' hours')::interval)
         RETURNING id, code, created_by, used_by, expires_at, created_at",
    )
    .bind(&code)
    .bind(auth.user_id)
    .bind(expires_in_hours.to_string())
    .fetch_one(&state.db)
    .await?;

    Ok(Json(invite))
}

async fn list_invites(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Invite>>, AppError> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden);
    }

    let invites = sqlx::query_as::<_, Invite>(
        "SELECT id, code, created_by, used_by, expires_at, created_at
         FROM invites ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(invites))
}
