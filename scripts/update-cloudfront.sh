#!/bin/bash
# Update CloudFront distribution to point to NLB
# CloudFront handles SSL termination, NLB forwards to ECS

CLOUDFRONT_ID="E2M1KYGNR5D6FH"
NLB_DNS_NAME="$1"

if [ -z "$NLB_DNS_NAME" ]; then
  echo "Usage: $0 <nlb-dns-name>"
  echo "Example: $0 citizen-science-nlb-123456789.us-east-1.elb.amazonaws.com"
  echo ""
  echo "Get NLB DNS from Terraform output: terraform output -raw nlb_dns_name"
  exit 1
fi

echo "Getting current CloudFront distribution config..."
aws cloudfront get-distribution-config --id $CLOUDFRONT_ID > /tmp/cf-config.json

ETAG=$(jq -r '.ETag' /tmp/cf-config.json)
CONFIG=$(jq '.DistributionConfig' /tmp/cf-config.json)

echo "Updating origin to point to NLB: $NLB_DNS_NAME"
echo "Note: CloudFront handles SSL, NLB forwards HTTP to ECS on port 3000"

# Update the origin to use custom origin with HTTP (CloudFront handles SSL)
UPDATED_CONFIG=$(echo "$CONFIG" | jq --arg dns "$NLB_DNS_NAME" '
  .Origins.Items[0].Id = "citizen-science-nlb" |
  .Origins.Items[0].DomainName = $dns |
  .Origins.Items[0].CustomOriginConfig = {
    "HTTPPort": 80,
    "HTTPSPort": 80,
    "OriginProtocolPolicy": "http-only",
    "OriginSslProtocols": {
      "Quantity": 1,
      "Items": ["TLSv1.2"]
    },
    "OriginReadTimeout": 30,
    "OriginKeepaliveTimeout": 5
  } |
  del(.Origins.Items[0].S3OriginConfig)
')

echo "$UPDATED_CONFIG" > /tmp/cf-config-updated.json

echo "Updating CloudFront distribution..."
aws cloudfront update-distribution \
  --id $CLOUDFRONT_ID \
  --if-match $ETAG \
  --distribution-config file:///tmp/cf-config-updated.json

echo ""
echo "✅ CloudFront distribution update initiated"
echo "⚠️  Note: CloudFront updates can take 15-20 minutes to deploy"
echo "Check status with: aws cloudfront get-distribution --id $CLOUDFRONT_ID --query 'Distribution.Status'"

