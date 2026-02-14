use std::path::{Path, PathBuf};
use std::sync::Arc;

use ocr_rs::OcrEngine;
use sqlx::PgPool;
use uuid::Uuid;

/// Try to initialize the OCR engine from model files in the given directory.
/// Returns `None` if models are not found or initialization fails.
pub fn init_engine(model_dir: &str) -> Option<Arc<OcrEngine>> {
    let dir = Path::new(model_dir);
    let det_path = dir.join("PP-OCRv5_mobile_det.mnn");
    let rec_path = dir.join("latin_PP-OCRv5_mobile_rec_infer.mnn");
    let keys_path = dir.join("ppocr_keys_latin.txt");

    for path in [&det_path, &rec_path, &keys_path] {
        if !path.exists() {
            tracing::warn!("OCR model file not found: {}", path.display());
            return None;
        }
    }

    match OcrEngine::new(
        det_path.to_str().unwrap(),
        rec_path.to_str().unwrap(),
        keys_path.to_str().unwrap(),
        None,
    ) {
        Ok(engine) => {
            tracing::info!("OCR engine initialized from {model_dir}");
            Some(Arc::new(engine))
        }
        Err(e) => {
            tracing::warn!("Failed to initialize OCR engine: {e}");
            None
        }
    }
}

/// Run OCR on image bytes. Returns the recognized text or None on failure.
pub fn recognize(engine: &OcrEngine, image_bytes: &[u8]) -> Option<String> {
    let image = match image::load_from_memory(image_bytes) {
        Ok(img) => img,
        Err(e) => {
            tracing::warn!("OCR: failed to decode image: {e}");
            return None;
        }
    };

    match engine.recognize(&image) {
        Ok(results) => {
            let text: String = results
                .iter()
                .map(|r| r.text.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        }
        Err(e) => {
            tracing::warn!("OCR recognition failed: {e}");
            None
        }
    }
}

/// Spawn a background task to read a file from disk, run OCR, and update the database.
pub fn spawn_ocr_task(
    engine: Arc<OcrEngine>,
    db: PgPool,
    media_id: Uuid,
    file_path: PathBuf,
) {
    tokio::spawn(async move {
        let bytes = match tokio::fs::read(&file_path).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("OCR: failed to read file {}: {e}", file_path.display());
                return;
            }
        };

        let result = tokio::task::spawn_blocking(move || recognize(&engine, &bytes)).await;

        match result {
            Ok(Some(text)) => {
                if let Err(e) = sqlx::query("UPDATE media SET ocr_text = $1 WHERE id = $2")
                    .bind(&text)
                    .bind(media_id)
                    .execute(&db)
                    .await
                {
                    tracing::warn!("Failed to save OCR text for {media_id}: {e}");
                }
            }
            Ok(None) => {
                tracing::debug!("No text detected by OCR for {media_id}");
            }
            Err(e) => {
                tracing::warn!("OCR task panicked for {media_id}: {e}");
            }
        }
    });
}
