resource "scaleway_registry_namespace" "main" {
  name      = "meemit"
  region    = var.scaleway_region
  is_public = false
}
