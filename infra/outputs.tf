output "container_url" {
  value = scaleway_container.backend.domain_name
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "media_bucket_endpoint" {
  value = "https://s3.${var.scaleway_region}.scw.cloud/${scaleway_object_bucket.media.name}"
}
