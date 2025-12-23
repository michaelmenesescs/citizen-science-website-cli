# Documentation Index

This repository contains comprehensive documentation for the Citizen Science website infrastructure and deployment.

## Documentation Files

### 📚 [README.md](../README.md)
Project overview, quick start guide, and links to all documentation.

### 🏗️ [INFRASTRUCTURE.md](../INFRASTRUCTURE.md)
Complete infrastructure documentation including:
- Architecture overview
- AWS components (CloudFront, NLB, ECS, ECR)
- Terraform configuration
- Security considerations
- Cost breakdown
- Monitoring and alerts
- Disaster recovery

### 🚀 [DEPLOYMENT.md](../DEPLOYMENT.md)
Step-by-step deployment guide:
- Building Docker images
- Deploying to ECS
- CloudFront cache invalidation
- Verification steps
- Troubleshooting common issues

### 🐳 [DOCKER.md](../DOCKER.md)
Docker configuration and build process:
- Dockerfile explanation
- Multi-stage build details
- Health check configuration
- Building for production
- Troubleshooting Docker issues

## Quick Reference

### Deploy New Version

```bash
# 1. Build and push
docker build --platform linux/amd64 -t citizen-science-website .
docker tag citizen-science-website:latest <ECR_URL>:latest
docker push <ECR_URL>:latest

# 2. Deploy
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment

# 3. Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id E2M1KYGNR5D6FH \
  --paths "/*"
```

### View Logs

```bash
aws logs tail /ecs/citizen-science-task --follow
```

### Check Status

```bash
aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service
```

## Important Notes

⚠️ **Always build with `--platform linux/amd64`** - ECS Fargate uses x86_64 architecture

⚠️ **CloudFront DefaultRootObject must be empty** - Required for dynamic Next.js origins

⚠️ **Health check requires `wget`** - Must be installed in Dockerfile

## Support

For issues or questions, refer to the troubleshooting sections in each documentation file.

