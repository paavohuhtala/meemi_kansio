use std::io::Cursor;
use std::path::Path;

use image::imageops::FilterType;
use image::{DynamicImage, ImageReader};

use crate::error::AppError;

const THUMB_MAX_DIM: u32 = 400;
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

/// Generate gallery thumbnail (WebP) and clipboard copy (PNG) for a media file.
/// `bytes` is the raw uploaded file content.
/// `upload_dir` is the directory where thumbnails are written.
/// `file_stem` is the UUID portion of the filename (e.g. "abc123" from "abc123.jpg").
pub fn generate(
    bytes: &[u8],
    upload_dir: &Path,
    file_stem: &str,
) -> Result<(), AppError> {
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| AppError::Internal(format!("Failed to detect image format: {e}")))?
        .decode()
        .map_err(|e| AppError::Internal(format!("Failed to decode image: {e}")))?;

    // Gallery thumbnail — lossless WebP (small due to resize)
    let thumb = resize_to_max(&img, THUMB_MAX_DIM);
    let thumb_path = upload_dir.join(format!("{file_stem}_thumb.webp"));
    thumb
        .save(&thumb_path)
        .map_err(|e| AppError::Internal(format!("Failed to save thumbnail: {e}")))?;

    // Clipboard copy — PNG, lossless
    let clipboard = resize_to_max(&img, CLIPBOARD_MAX_DIM);
    let clipboard_path = upload_dir.join(format!("{file_stem}_clipboard.png"));
    clipboard
        .save(&clipboard_path)
        .map_err(|e| AppError::Internal(format!("Failed to save clipboard image: {e}")))?;

    Ok(())
}

/// Return the thumbnail file paths derived from the original filename.
/// Used for cleanup during delete/replace.
pub fn thumbnail_paths(upload_dir: &Path, file_name: &str) -> [std::path::PathBuf; 2] {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    [
        upload_dir.join(format!("{stem}_thumb.webp")),
        upload_dir.join(format!("{stem}_clipboard.png")),
    ]
}
