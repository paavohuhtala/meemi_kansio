use std::path::{Path, PathBuf};

use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::ObjectCannedAcl;
use aws_sdk_s3::Client as S3Client;

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
pub struct S3Storage {
    client: S3Client,
    bucket: String,
    public_base_url: String,
}

impl S3Storage {
    pub async fn new(
        bucket: String,
        region: String,
        endpoint: String,
        access_key_id: String,
        secret_access_key: String,
    ) -> Self {
        let credentials = aws_sdk_s3::config::Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "env",
        );

        let config = aws_sdk_s3::config::Builder::new()
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .region(aws_sdk_s3::config::Region::new(region.clone()))
            .endpoint_url(&endpoint)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = S3Client::from_conf(config);
        let public_base_url = format!("{endpoint}/{bucket}");

        Self {
            client,
            bucket,
            public_base_url,
        }
    }

    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data.to_vec()))
            .content_type(content_type)
            .acl(ObjectCannedAcl::PublicRead)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("S3 put failed: {e}")))?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("S3 get failed: {e}")))?;
        let bytes = resp
            .body
            .collect()
            .await
            .map_err(|e| AppError::Internal(format!("S3 read body failed: {e}")))?;
        Ok(bytes.to_vec())
    }

    pub async fn delete(&self, key: &str) {
        let _ = self
            .client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await;
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_base_url)
    }
}

#[derive(Clone)]
pub enum StorageBackend {
    Local(LocalStorage),
    S3(S3Storage),
}

impl StorageBackend {
    pub async fn put(&self, key: &str, data: &[u8], content_type: &str) -> Result<(), AppError> {
        match self {
            Self::Local(s) => s.put(key, data, content_type).await,
            Self::S3(s) => s.put(key, data, content_type).await,
        }
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, AppError> {
        match self {
            Self::Local(s) => s.get(key).await,
            Self::S3(s) => s.get(key).await,
        }
    }

    pub async fn delete(&self, key: &str) {
        match self {
            Self::Local(s) => s.delete(key).await,
            Self::S3(s) => s.delete(key).await,
        }
    }

    pub fn public_url(&self, key: &str) -> String {
        match self {
            Self::Local(s) => s.public_url(key),
            Self::S3(s) => s.public_url(key),
        }
    }

    pub fn local_upload_dir(&self) -> Option<&Path> {
        match self {
            Self::Local(s) => Some(s.upload_dir()),
            Self::S3(_) => None,
        }
    }
}
