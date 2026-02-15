resource "aws_route53_record" "meemit" {
  zone_id = var.route53_zone_id
  name    = "meemit.mainittu.fi"
  type    = "CNAME"
  ttl     = 300
  records = [scaleway_container.backend.domain_name]
}

resource "scaleway_container_domain" "backend" {
  container_id = scaleway_container.backend.id
  hostname     = "meemit.mainittu.fi"
}
