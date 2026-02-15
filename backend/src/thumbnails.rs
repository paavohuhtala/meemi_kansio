use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader};

use crate::error::AppError;

const THUMB_MAX_DIM: u32 = 600;
const CLIPBOARD_MAX_DIM: u32 = 1024;

/// Resize an image so its longest dimension is at most `max_dim`.
/// Returns the image unchanged if it's already within bounds.
fn resize_to_max(img: &DynamicImage, max_dim: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let longest = w.max(h);
    if longest <= max_dim {
        return img.clone();
    }
    img.resize(
        (w as f64 * max_dim as f64 / longest as f64) as u32,
        (h as f64 * max_dim as f64 / longest as f64) as u32,
        FilterType::Lanczos3,
    )
}

fn encode_webp(img: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::WebP)
        .map_err(|e| AppError::Internal(format!("Failed to encode WebP: {e}")))?;
    Ok(buf.into_inner())
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| AppError::Internal(format!("Failed to encode PNG: {e}")))?;
    Ok(buf.into_inner())
}

/// Generate gallery thumbnail (WebP bytes) and clipboard copy (PNG bytes).
/// Returns (thumbnail_webp, clipboard_png).
pub fn generate(bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>), AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    let clipboard = resize_to_max(&img, CLIPBOARD_MAX_DIM);

    Ok((encode_webp(&thumb)?, encode_png(&clipboard)?))
}

/// Generate only the gallery thumbnail (WebP bytes) from raw image bytes.
/// Used for video frames where a clipboard copy isn't needed.
pub fn generate_gallery_thumb(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    encode_webp(&thumb)
}

/// Return the thumbnail storage keys derived from the original filename.
/// Used for cleanup during delete/replace.
pub fn thumbnail_keys(file_name: &str) -> [String; 2] {
    let stem = std::path::Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    [
        format!("{stem}_thumb.webp"),
        format!("{stem}_clipboard.png"),
    ]
}
