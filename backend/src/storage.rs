use std::path::{Path, PathBuf};

use crate::error::AppError;

#[derive(Clone)]
pub struct LocalStorage {
    upload_dir: PathBuf,
}

impl LocalStorage {
    pub fn new(upload_dir: &str) -> Self {
        Self {
            upload_dir: PathBuf::from(upload_dir),
        }
    }

    pub fn upload_dir(&self) -> &Path {
        &self.upload_dir
    }

    pub async fn put(&self, key: &str, data: &[u8], _content_type: &str) -> Result<(), AppError> {
        let path = self.upload_dir.join(key);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to create directory: {e}")))?;
        }
        tokio::fs::write(&path, data)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let path = self.upload_dir.join(key);
        tokio::fs::read(&path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read file {key}: {e}")))
    }

    pub async fn delete(&self, key: &str) {
        let path = self.upload_dir.join(key);
        let _ = tokio::fs::remove_file(&path).await;
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("/api/files/{key}")
    }
}

#[derive(Clone)]
pub enum StorageBackend {
    Local(LocalStorage),
}

impl StorageBackend {
    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        match self {
            Self::Local(s) => s.put(key, data, content_type).await,
        }
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        match self {
            Self::Local(s) => s.get(key).await,
        }
    }

    pub async fn delete(&self, key: &str) {
        match self {
            Self::Local(s) => s.delete(key).await,
        }
    }

    pub fn public_url(&self, key: &str) -> String {
        match self {
            Self::Local(s) => s.public_url(key),
        }
    }

    pub fn local_upload_dir(&self) -> Option<&Path> {
        match self {
            Self::Local(s) => Some(s.upload_dir()),
        }
    }
}
