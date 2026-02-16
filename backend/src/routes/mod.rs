pub mod auth;
pub mod invites;
pub mod media;
pub mod tags;
pub mod test_seed;

use axum::Router;
use crate::AppState;

pub fn api_router(enable_test_routes: bool) -> Router<AppState> {
    let router = Router::new()
        .merge(auth::router())
        .merge(invites::router())
        .merge(media::router())
        .merge(tags::router());

    if enable_test_routes {
        tracing::info!("test routes enabled");
        router.merge(test_seed::router())
    } else {
        router
    }
}
