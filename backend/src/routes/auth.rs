use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, SameSite};
use axum_extra::extract::CookieJar;

use crate::auth::middleware::AuthUser;
use crate::auth::{jwt, password};
use crate::error::AppError;
use crate::models::user::{LoginRequest, RegisterRequest, User, UserResponse, UserRole};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
}

async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<UserResponse>), AppError> {
    let username = body.username.trim().to_lowercase();

    if username.is_empty() || body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Username required and password must be at least 8 characters".into(),
        ));
    }

    // Check if any users exist (first user = admin, no invite needed)
    let (user_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    let role;
    let mut invite_id: Option<uuid::Uuid> = None;

    if user_count == 0 {
        role = UserRole::Admin;
    } else {
        let code = body
            .invite_code
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("Invite code required".into()))?;

        let row = sqlx::query_as::<_, (uuid::Uuid,)>(
            "SELECT id FROM invites WHERE code = $1 AND used_by IS NULL AND expires_at > now()",
        )
        .bind(code)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("Invalid or expired invite code".into()))?;

        invite_id = Some(row.0);
        role = UserRole::Member;
    }

    // Check username uniqueness
    let (existing,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM users WHERE username = $1")
            .bind(&username)
            .fetch_one(&state.db)
            .await?;

    if existing > 0 {
        return Err(AppError::Conflict("Username already taken".into()));
    }

    let password_hash = password::hash_password(&body.password)?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, username, password_hash, role, created_at, updated_at",
    )
    .bind(&username)
    .bind(&password_hash)
    .bind(&role)
    .fetch_one(&state.db)
    .await?;

    // Mark invite as used
    if let Some(inv_id) = invite_id {
        sqlx::query("UPDATE invites SET used_by = $1 WHERE id = $2")
            .bind(user.id)
            .bind(inv_id)
            .execute(&state.db)
            .await?;
    }

    let token = jwt::create_token(user.id, &user.username, &user.role, &state.config.jwt_secret)?;
    let cookie = build_auth_cookie(token);

    Ok((jar.add(cookie), Json(UserResponse::from(user))))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> Result<(CookieJar, Json<UserResponse>), AppError> {
    let username = body.username.trim().to_lowercase();

    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at
         FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::InvalidCredentials)?;

    if !password::verify_password(&body.password, &user.password_hash)? {
        return Err(AppError::InvalidCredentials);
    }

    let token = jwt::create_token(user.id, &user.username, &user.role, &state.config.jwt_secret)?;
    let cookie = build_auth_cookie(token);

    Ok((jar.add(cookie), Json(UserResponse::from(user))))
}

async fn logout(jar: CookieJar) -> CookieJar {
    jar.remove(Cookie::build("token").path("/"))
}

async fn me(auth: AuthUser) -> Json<UserResponse> {
    Json(UserResponse {
        id: auth.user_id,
        username: auth.username,
        role: auth.role,
        created_at: chrono::Utc::now(), // Not ideal, but avoids a DB query
    })
}

fn build_auth_cookie(token: String) -> Cookie<'static> {
    Cookie::build(("token", token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(24))
        .build()
}
