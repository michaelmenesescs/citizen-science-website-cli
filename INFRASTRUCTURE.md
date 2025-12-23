# Infrastructure Documentation

This document describes the AWS infrastructure setup for the Citizen Science website.

## Architecture Overview

```
Internet → CloudFront (CDN) → Network Load Balancer (NLB) → ECS Fargate → Next.js App
```

### Components

1. **CloudFront Distribution** (`E2M1KYGNR5D6FH`)
   - SSL/TLS termination
   - CDN caching
   - Custom domains: `citizensciencemusic.com`, `www.citizensciencemusic.com`
   - Origin: NLB DNS name

2. **Network Load Balancer (NLB)**
   - Name: `citizen-science-nlb`
   - Type: Internet-facing
   - Listener: Port 80 (TCP) → Target Group on port 3000
   - Cost: ~$3-4/month (much cheaper than ALB at ~$16/month)

3. **ECS Fargate**
   - Cluster: `citizen-science-cluster`
   - Service: `citizen-science-service`
   - Task Definition: `citizen-science-task`
   - Resources: 256 CPU, 512MB RAM
   - Desired Count: 1 task

4. **ECR Repository**
   - Name: `citizen-science-website`
   - Stores Docker images for deployment

5. **Security Groups**
   - NLB SG: Allows HTTP (port 80) from 0.0.0.0/0
   - ECS SG: Allows HTTP (port 3000) from NLB security group only

## Infrastructure as Code (Terraform)

All infrastructure is managed via Terraform in the `terraform/` directory.

### Key Files

- `main.tf` - Main infrastructure resources (ECS, NLB, IAM, Security Groups)
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `cloudfront-update.tf` - CloudFront data source (CloudFront is managed separately)

### Important Configuration

#### CloudFront Configuration

CloudFront is **not** managed by Terraform (it was created manually). Key settings:

- **Cache Policy**: `Managed-CachingDisabled` (ID: `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`)
  - Disables caching to ensure dynamic Next.js content is always fresh
- **Origin Request Policy**: `Managed-AllViewerExceptHostHeader` (ID: `b689b0a8-53d0-40ab-baf2-68738e2966ac`)
  - Forwards all viewer headers except Host header
- **Default Root Object**: **Empty** (critical - must be empty for dynamic origins)
- **Allowed HTTP Methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
- **Viewer Protocol Policy**: `redirect-to-https`

#### ECS Health Check Configuration

The health check uses `wget` to verify the container is responding:

```json
{
  "command": ["CMD-SHELL", "/usr/bin/wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1"],
  "interval": 30,
  "timeout": 10,
  "retries": 3,
  "startPeriod": 90
}
```

**Important**: The `startPeriod` of 90 seconds gives Next.js time to fully start before health checks begin.

### Deploying Infrastructure Changes

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

**Note**: CloudFront changes must be made via AWS CLI or Console, not Terraform.

## Docker Configuration

### Dockerfile

The Dockerfile uses a multi-stage build:

1. **deps stage**: Installs dependencies
2. **builder stage**: Builds Next.js application
3. **runner stage**: Production image with:
   - `wget` installed (required for health checks)
   - Next.js standalone output
   - Runs as non-root user (`nextjs`)

### Critical Configuration

- **Platform**: Must build for `linux/amd64` (ECS Fargate uses x86_64, not ARM)
- **Health Check Tool**: `wget` must be installed in the runner stage
- **User**: Runs as `nextjs` user (non-root for security)

### Building and Pushing Images

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build for correct architecture
docker build --platform linux/amd64 -t citizen-science-website .

# Tag and push
docker tag citizen-science-website:latest \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
```

## Deployment Process

### Manual Deployment

1. **Build and push Docker image** (see above)

2. **Update ECS service**:
```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment \
  --region us-east-1
```

3. **Invalidate CloudFront cache** (if needed):
```bash
aws cloudfront create-invalidation \
  --distribution-id E2M1KYGNR5D6FH \
  --paths "/*"
```

### Monitoring Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service \
  --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount}'

# View logs
aws logs tail /ecs/citizen-science-task --follow

# Check target health
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names citizen-science-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
```

## Common Issues and Solutions

### Issue: Tasks Failing Health Checks

**Symptoms**: Tasks start but then stop with "Task failed container health checks"

**Solutions**:
1. Verify `wget` is installed in Dockerfile
2. Check health check timeout/start period settings
3. Ensure Next.js is binding to `0.0.0.0:3000` (not `localhost`)
4. Check CloudWatch logs for application errors

### Issue: CloudFront Returns 404

**Symptoms**: Direct NLB access works, but CloudFront returns 404

**Solutions**:
1. **Check DefaultRootObject**: Must be empty (`""`) for dynamic origins
2. Verify origin configuration points to correct NLB DNS
3. Check origin request policy forwards necessary headers
4. Invalidate CloudFront cache: `aws cloudfront create-invalidation --distribution-id E2M1KYGNR5D6FH --paths "/*"`

### Issue: Architecture Mismatch

**Symptoms**: "exec format error" in logs

**Solution**: Always build with `--platform linux/amd64` flag:
```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

### Issue: Health Check Timeout

**Symptoms**: Health checks fail even though app is running

**Solutions**:
1. Increase `startPeriod` in task definition (currently 90s)
2. Increase `timeout` (currently 10s)
3. Verify health check command uses full path: `/usr/bin/wget`

## Cost Breakdown

- **ECS Fargate** (256 CPU, 512MB RAM): ~$10-15/month
- **Network Load Balancer**: ~$3-4/month
- **CloudFront**: ~$1-2/month (data transfer)
- **ECR Storage**: ~$0.10/GB/month (first 500MB free)
- **CloudWatch Logs**: First 5GB free, then $0.50/GB
- **Route 53**: ~$0.50/month per hosted zone

**Total**: ~$15-22/month (assuming low traffic)

## Security Considerations

1. **Security Groups**: ECS tasks only accept traffic from NLB security group
2. **Non-root User**: Container runs as `nextjs` user (UID 1001)
3. **HTTPS**: CloudFront handles SSL/TLS termination
4. **Private Subnets**: ECS tasks can use private subnets (currently using public for simplicity)

## Scaling

Current setup runs 1 task. To scale:

1. **Horizontal Scaling**: Increase `desired_count` in ECS service
2. **Vertical Scaling**: Increase CPU/memory in task definition
3. **Auto Scaling**: Can add ECS Auto Scaling based on CPU/memory metrics

## Backup and Recovery

- **Infrastructure**: Managed by Terraform (state file in `terraform/`)
- **Application Code**: Version controlled in Git
- **Docker Images**: Stored in ECR (versioned by tags)
- **Logs**: Stored in CloudWatch Logs (7-day retention)

## Maintenance

### Updating Infrastructure

1. Modify Terraform files
2. Run `terraform plan` to preview changes
3. Run `terraform apply` to deploy

### Updating Application

1. Build new Docker image
2. Push to ECR
3. Force ECS service deployment
4. Invalidate CloudFront cache if needed

### Updating CloudFront

Use AWS CLI or Console (not Terraform):

```bash
# Get current config
aws cloudfront get-distribution-config --id E2M1KYGNR5D6FH > config.json

# Modify config.json, then update
aws cloudfront update-distribution \
  --id E2M1KYGNR5D6FH \
  --if-match <ETAG> \
  --distribution-config file://config.json
```

## Monitoring and Alerts

### Key Metrics to Monitor

- ECS Service: Running task count, CPU utilization, memory utilization
- NLB: Healthy target count, request count
- CloudFront: Request count, error rate, cache hit ratio
- Application: Response time, error rate (via CloudWatch Logs)

### Setting Up Alarms

```bash
# Example: Alert if no tasks are running
aws cloudwatch put-metric-alarm \
  --alarm-name ecs-no-tasks-running \
  --alarm-description "Alert when ECS service has no running tasks" \
  --metric-name RunningTaskCount \
  --namespace AWS/ECS \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1
```

## Disaster Recovery

1. **Infrastructure**: Recreate via Terraform
2. **Application**: Rebuild from source code
3. **Data**: Application is stateless (no database)
4. **DNS**: Route 53 records can be recreated

## Future Improvements

- [ ] Add CloudWatch Alarms for monitoring
- [ ] Implement auto-scaling based on traffic
- [ ] Add staging environment
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Add database if needed
- [ ] Implement blue/green deployments
- [ ] Add WAF rules to CloudFront
- [ ] Enable CloudFront access logs

