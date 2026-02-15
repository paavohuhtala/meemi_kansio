variable "scaleway_region" {
  type    = string
  default = "fr-par"
}

variable "scaleway_project_id" {
  type        = string
  description = "Scaleway project ID"
}

variable "image_tag" {
  type        = string
  description = "Docker image tag (git SHA) to deploy"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "s3_access_key_id" {
  type      = string
  sensitive = true
}

variable "s3_secret_access_key" {
  type      = string
  sensitive = true
}

variable "route53_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID for mainittu.fi"
}

variable "aws_access_key_id" {
  type      = string
  sensitive = true
}

variable "aws_secret_access_key" {
  type      = string
  sensitive = true
}
