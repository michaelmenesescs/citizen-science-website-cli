# Deployment Guide

This guide walks you through deploying the Citizen Science website to AWS.

## Architecture Overview

```
Internet → CloudFront (CDN) → Network Load Balancer → ECS Fargate → Next.js App
```

**Current Setup**: CloudFront + NLB + ECS Fargate (~$15-22/month)

**Domains**: 
- `citizensciencemusic.com`
- `www.citizensciencemusic.com`
- CloudFront: `d35bp93zf2ayyg.cloudfront.net`

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured (`aws configure`)
3. Docker installed (for local testing)
4. Terraform installed (for infrastructure management)
5. Domain name configured in Route 53 (optional, for custom domain)

## Infrastructure Setup

The infrastructure is managed via Terraform. See `INFRASTRUCTURE.md` for detailed architecture documentation.

### Quick Start

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This creates:
- ECR repository
- ECS cluster, service, and task definition
- Network Load Balancer
- Security groups
- IAM roles
- CloudWatch log group

**Note**: CloudFront distribution is managed separately (not in Terraform).

## Step 1: Build and Push Docker Image

### Get ECR Repository URL

```bash
# Get repository URL from Terraform output
cd terraform
ECR_URL=$(terraform output -raw ecr_repository_url)
echo "ECR URL: $ECR_URL"
```

Or get it directly:
```bash
aws ecr describe-repositories \
  --repository-names citizen-science-website \
  --query 'repositories[0].repositoryUri' \
  --output text
```

### Build Docker Image

**IMPORTANT**: Always build for `linux/amd64` architecture (ECS Fargate uses x86_64):

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build for correct platform
docker build --platform linux/amd64 -t citizen-science-website .

# Tag image
docker tag citizen-science-website:latest \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest

# Push to ECR
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
```

**Key Points**:
- Use `--platform linux/amd64` flag (Mac builds ARM by default)
- Image must include `wget` for health checks (see Dockerfile)
- Tag as `:latest` for automatic deployment

## Step 2: Deploy to ECS

After pushing the image, force a new deployment:

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment \
  --region us-east-1
```

Monitor the deployment:

```bash
# Watch service status
watch -n 5 'aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service \
  --query "services[0].{Running:runningCount,Desired:desiredCount}" \
  --output json'

# View logs
aws logs tail /ecs/citizen-science-task --follow
```

## Step 3: Invalidate CloudFront Cache

After deployment, invalidate CloudFront cache to serve new content:

```bash
aws cloudfront create-invalidation \
  --distribution-id E2M1KYGNR5D6FH \
  --paths "/*"
```

Wait 1-2 minutes for invalidation to complete, then test your site.

## Step 4: Test Locally

```bash
# Build and test Docker image locally
docker build -t citizen-science-website .
docker run -p 3000:3000 citizen-science-website

# Or use docker-compose
docker-compose up
```

## Step 5: Verify Deployment

### Check Service Status

```bash
aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service \
  --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount}' \
  --output json
```

### Check Target Health

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names citizen-science-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
```

### Test Endpoints

```bash
# Test NLB directly
curl -I http://citizen-science-nlb-0bc7103c85b818a5.elb.us-east-1.amazonaws.com/

# Test CloudFront
curl -I https://d35bp93zf2ayyg.cloudfront.net/

# Test custom domain
curl -I https://citizensciencemusic.com/
```

All should return `HTTP/2 200` or `HTTP/1.1 200`.

## Troubleshooting

### View Logs

```bash
# Follow logs in real-time
aws logs tail /ecs/citizen-science-task --follow

# View recent logs
aws logs tail /ecs/citizen-science-task --since 30m
```

### Check Task Status

```bash
# List running tasks
aws ecs list-tasks --cluster citizen-science-cluster --desired-status RUNNING

# Describe specific task
aws ecs describe-tasks \
  --cluster citizen-science-cluster \
  --tasks <TASK_ARN> \
  --query 'tasks[0].{Status:lastStatus,Health:healthStatus,StoppedReason:stoppedReason}'
```

### Common Issues

#### 1. Tasks Failing Health Checks

**Symptoms**: Tasks start but stop with "Task failed container health checks"

**Solutions**:
- Verify `wget` is installed in Dockerfile
- Check health check timeout/start period in task definition
- Ensure Next.js binds to `0.0.0.0:3000` (check `HOSTNAME` env var)
- Review CloudWatch logs for application errors

#### 2. CloudFront Returns 404

**Symptoms**: Direct NLB access works, CloudFront returns 404

**Solutions**:
- **Critical**: Ensure CloudFront `DefaultRootObject` is **empty** (`""`)
- Verify origin points to correct NLB DNS name
- Check origin request policy configuration
- Invalidate CloudFront cache: `aws cloudfront create-invalidation --distribution-id E2M1KYGNR5D6FH --paths "/*"`

#### 3. Architecture Mismatch Error

**Symptoms**: "exec format error" in logs

**Solution**: Always build with `--platform linux/amd64`:
```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

#### 4. Can't Pull Image

**Solutions**:
- Verify ECR permissions on execution role
- Check image tag exists in ECR
- Ensure correct region

#### 5. NLB Timeout

**Symptoms**: CloudFront shows "Error from cloudfront", NLB times out

**Solutions**:
- Check ECS tasks are running and healthy
- Verify security group allows traffic from NLB
- Check target group health status
- Review ECS service events for errors

## Cost Breakdown

- **ECS Fargate** (256 CPU, 512MB RAM): ~$10-15/month
- **Network Load Balancer**: ~$3-4/month (much cheaper than ALB)
- **CloudFront**: ~$1-2/month (data transfer)
- **ECR Storage**: ~$0.10/GB/month (first 500MB free)
- **CloudWatch Logs**: First 5GB free, then $0.50/GB
- **Route 53**: ~$0.50/month per hosted zone

**Total: ~$15-22/month** (assuming low traffic)

**Cost Optimization**:
- Using NLB instead of ALB (saves ~$12/month)
- Single task instance (no HA)
- Minimal resources (256 CPU, 512MB RAM)
- Using default VPC (no extra networking costs)

## Stopping/Starting Service

To stop the service and save money:

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --desired-count 0 \
  --region us-east-1
```

To restart:

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --desired-count 1 \
  --region us-east-1
```

## Additional Resources

- **Infrastructure Details**: See `INFRASTRUCTURE.md` for architecture documentation
- **Terraform State**: Infrastructure is managed in `terraform/` directory
- **Scripts**: Helper scripts in `scripts/` directory
  - `get-public-ip.sh` - Get ECS task public IP
  - `update-cloudfront.sh` - Update CloudFront origin (if needed)

## Next Steps (Optional)

- **CI/CD Pipeline**: Set up GitHub Actions for automated deployments
- **Auto-scaling**: Add ECS Auto Scaling based on CPU/memory metrics
- **CloudWatch Alarms**: Monitor costs and uptime
- **Staging Environment**: Create separate environment for testing
- **WAF**: Add Web Application Firewall rules to CloudFront

