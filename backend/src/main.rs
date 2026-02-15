mod auth;
mod config;
mod error;
mod models;
pub mod ocr;
mod routes;
mod storage;
mod thumbnails;
mod video;

use std::sync::Arc;

use axum::{extract::State, routing::get, Json, Router};
use config::Config;
use ocr_rs::OcrEngine;
use sqlx::PgPool;
use storage::{LocalStorage, S3Storage, StorageBackend};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Arc<Config>,
    pub ocr: Option<Arc<OcrEngine>>,
    pub storage: StorageBackend,
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

    let ocr = ocr::init_engine(&config.model_dir);
    let storage = match config.storage_backend.as_str() {
        "s3" => {
            let bucket = config
                .s3_bucket
                .clone()
                .expect("S3_BUCKET required when STORAGE_BACKEND=s3");
            let region = config
                .s3_region
                .clone()
                .expect("S3_REGION required when STORAGE_BACKEND=s3");
            let endpoint = config
                .s3_endpoint
                .clone()
                .expect("S3_ENDPOINT required when STORAGE_BACKEND=s3");
            let access_key = config
                .s3_access_key_id
                .clone()
                .expect("S3_ACCESS_KEY_ID required when STORAGE_BACKEND=s3");
            let secret_key = config
                .s3_secret_access_key
                .clone()
                .expect("S3_SECRET_ACCESS_KEY required when STORAGE_BACKEND=s3");
            StorageBackend::S3(
                S3Storage::new(bucket, region, endpoint, access_key, secret_key).await,
            )
        }
        _ => StorageBackend::Local(LocalStorage::new(&config.upload_dir)),
    };

    let state = AppState {
        db,
        config: Arc::new(config),
        ocr,
        storage,
    };

    let mut app = Router::new()
        .route("/api/health", get(health))
        .merge(routes::api_router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    // Serve uploaded files from local disk when using local storage
    if let Some(upload_dir) = state.storage.local_upload_dir() {
        app = app.nest_service("/api/files", ServeDir::new(upload_dir));
    }

    // Serve static frontend files when STATIC_DIR is set
    if let Some(static_dir) = &state.config.static_dir {
        let index_path = format!("{static_dir}/index.html");
        app = app.fallback_service(
            ServeDir::new(static_dir).fallback(ServeFile::new(index_path)),
        );
        tracing::info!("serving static files from {}", static_dir);
    }

    let addr = format!("{}:{}", state.config.host, state.config.port);
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
