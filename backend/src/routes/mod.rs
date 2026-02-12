pub mod auth;
pub mod invites;
pub mod media;
pub mod tags;

use axum::Router;
use crate::AppState;

pub fn api_router(upload_dir: &str) -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(invites::router())
        .merge(media::router(upload_dir))
        .merge(tags::router())
}
