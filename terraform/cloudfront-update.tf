# CloudFront will be updated via script after ECS task is running
# CloudFront handles SSL termination, so ECS only needs to serve HTTP

data "aws_cloudfront_distribution" "existing" {
  id = "E2M1KYGNR5D6FH"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID that needs to be updated"
  value       = data.aws_cloudfront_distribution.existing.id
}

output "cloudfront_update_note" {
  description = "Instructions for updating CloudFront"
  value       = "After Terraform applies, update CloudFront origin to point to NLB: ${aws_lb.nlb.dns_name}"
}

