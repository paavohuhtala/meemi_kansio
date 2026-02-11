pub mod auth;
pub mod invites;

use axum::Router;
use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(invites::router())
}
