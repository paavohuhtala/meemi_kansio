resource "scaleway_container_namespace" "main" {
  name   = "meemit"
  region = var.scaleway_region
}

resource "scaleway_container" "backend" {
  namespace_id = scaleway_container_namespace.main.id
  name         = "meemit-backend"
  description  = "meemi_kansio backend + frontend"

  registry_image = "${scaleway_registry_namespace.main.endpoint}/meemit-backend:${var.image_tag}"

  port         = 3000
  cpu_limit    = 1000
  memory_limit = 1024
  min_scale    = 0
  max_scale    = 1
  timeout      = 300
  privacy      = "public"

  environment_variables = {
    STORAGE_BACKEND = "s3"
    S3_BUCKET       = scaleway_object_bucket.media.name
    S3_REGION       = var.scaleway_region
    S3_ENDPOINT     = "https://s3.${var.scaleway_region}.scw.cloud"
    STATIC_DIR      = "/app/static"
    MODEL_DIR       = "/app/models"
    HOST            = "0.0.0.0"
  }

  secret_environment_variables = {
    DATABASE_URL         = var.database_url
    JWT_SECRET           = var.jwt_secret
    S3_ACCESS_KEY_ID     = var.s3_access_key_id
    S3_SECRET_ACCESS_KEY = var.s3_secret_access_key
  }
}
