mod config;

use axum::{extract::State, routing::get, Json, Router};
use config::Config;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let row: (i32,) = sqlx::query_as("SELECT 1").fetch_one(&state.db).await.unwrap();
    Json(serde_json::json!({ "status": "ok", "db": row.0 == 1 }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = Config::from_env();

    let db = PgPool::connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!()
        .run(&db)
        .await
        .expect("failed to run migrations");

    let state = AppState { db };

    let app = Router::new()
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
