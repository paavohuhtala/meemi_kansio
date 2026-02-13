use std::path::Path;

use tokio::process::Command;

use crate::error::AppError;

fn path_str(path: &Path) -> Result<&str, AppError> {
    path.to_str()
        .ok_or_else(|| AppError::Internal("Video path contains invalid UTF-8".into()))
}

async fn extract_frame_at(path_str: &str, timestamp: &str) -> Result<Vec<u8>, AppError> {
    let output = Command::new("ffmpeg")
        .args([
            "-ss", timestamp,
            "-i", path_str,
            "-vframes", "1",
            "-f", "image2",
            "-c:v", "png",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to run ffmpeg: {e}")))?;

    if output.status.success() && !output.stdout.is_empty() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::Internal(format!(
            "ffmpeg frame extraction failed: {stderr}"
        )))
    }
}

/// Extract a single video frame as PNG bytes.
///
/// Tries the frame at 1 second first; if that fails (e.g. video is shorter),
/// retries at 0 seconds (first frame).
pub async fn extract_frame(path: &Path) -> Result<Vec<u8>, AppError> {
    let s = path_str(path)?;
    match extract_frame_at(s, "1").await {
        Ok(bytes) => Ok(bytes),
        Err(_) => extract_frame_at(s, "0").await,
    }
}

/// Extract video dimensions (width, height) using ffprobe.
pub async fn probe_dimensions(path: &Path) -> Result<(i32, i32), AppError> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            path_str(path)?,
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to run ffprobe: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!("ffprobe failed: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = stdout.trim().split(',');
    let width: i32 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| AppError::Internal("ffprobe: could not parse width".into()))?;
    let height: i32 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| AppError::Internal("ffprobe: could not parse height".into()))?;

    Ok((width, height))
}
