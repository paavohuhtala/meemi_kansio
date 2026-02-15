resource "scaleway_object_bucket" "media" {
  name   = "meemit-media"
  region = var.scaleway_region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://meemit.mainittu.fi"]
    max_age_seconds = 3600
  }
}

resource "scaleway_object_bucket_acl" "media" {
  bucket = scaleway_object_bucket.media.id
  acl    = "public-read"
}
