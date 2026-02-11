use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub enum AppError {
    InvalidCredentials,
    Unauthorized,
    Forbidden,
    BadRequest(String),
    NotFound(String),
    Conflict(String),
    Internal(String),
    Database(sqlx::Error),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCredentials => write!(f, "Invalid username or password"),
            Self::Unauthorized => write!(f, "Authentication required"),
            Self::Forbidden => write!(f, "Insufficient permissions"),
            Self::BadRequest(msg) => write!(f, "{msg}"),
            Self::NotFound(msg) => write!(f, "{msg}"),
            Self::Conflict(msg) => write!(f, "{msg}"),
            Self::Internal(msg) => write!(f, "Internal error: {msg}"),
            Self::Database(e) => write!(f, "Database error: {e}"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::InvalidCredentials => (StatusCode::UNAUTHORIZED, self.to_string()),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            Self::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            Self::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            Self::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            Self::Conflict(_) => (StatusCode::CONFLICT, self.to_string()),
            Self::Internal(_) | Self::Database(_) => {
                tracing::error!("{self}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
        };

        if status.is_client_error() {
            tracing::warn!(status = status.as_u16(), "{message}");
        }

        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        Self::Database(e)
    }
}
