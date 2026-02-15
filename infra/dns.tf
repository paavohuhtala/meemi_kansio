resource "aws_route53_record" "meemit" {
  zone_id = var.route53_zone_id
  name    = "meemit.mainittu.fi"
  type    = "CNAME"
  ttl     = 300
  records = [scaleway_container.backend.domain_name]
}
