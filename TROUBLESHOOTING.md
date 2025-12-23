# Troubleshooting Guide

Quick reference for common issues and their solutions.

## Critical Issues We've Encountered

### 1. CloudFront Returns 404 (Fixed ✅)

**Symptoms**:
- Direct NLB access works (returns 200)
- CloudFront returns 404
- `x-cache: Error from cloudfront` header present

**Root Cause**: CloudFront had `DefaultRootObject: "index.html"` set, which is for S3 origins, not dynamic Next.js apps.

**Solution**: Set `DefaultRootObject` to empty string (`""`)

**How to Fix**:
```bash
# Get current config
aws cloudfront get-distribution-config --id E2M1KYGNR5D6FH > config.json

# Edit config.json: set DefaultRootObject to ""
# Then update
ETAG=$(cat config.json | jq -r '.ETag')
aws cloudfront update-distribution \
  --id E2M1KYGNR5D6FH \
  --if-match "$ETAG" \
  --distribution-config file://config.json
```

### 2. Tasks Failing Health Checks (Fixed ✅)

**Symptoms**:
- Tasks start successfully (Next.js logs show "Ready")
- Tasks stop after ~90 seconds
- Stopped reason: "Task failed container health checks"

**Root Causes & Solutions**:

#### a) Missing `wget` in Dockerfile
**Solution**: Add to Dockerfile:
```dockerfile
RUN apk add --no-cache wget
```

#### b) Wrong architecture (ARM vs x86)
**Solution**: Always build with:
```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

#### c) Health check timeout too short
**Solution**: Increase `startPeriod` to 90 seconds (already configured)

#### d) Application not binding to 0.0.0.0
**Solution**: Ensure `HOSTNAME=0.0.0.0` in Dockerfile (already configured)

### 3. Architecture Mismatch Error (Fixed ✅)

**Symptoms**:
- Logs show: "exec format error"
- Tasks fail immediately on start

**Root Cause**: Docker image built for ARM64 (Mac default) but ECS needs x86_64

**Solution**: Always use `--platform linux/amd64`:
```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

### 4. CloudFront Cache Issues

**Symptoms**:
- Changes not appearing after deployment
- Old content still showing

**Solution**: Invalidate CloudFront cache:
```bash
aws cloudfront create-invalidation \
  --distribution-id E2M1KYGNR5D6FH \
  --paths "/*"
```

Wait 1-2 minutes for invalidation to complete.

## Diagnostic Commands

### Check ECS Service Status

```bash
aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Events:events[0:3]}'
```

### Check Task Health

```bash
# List running tasks
aws ecs list-tasks --cluster citizen-science-cluster --desired-status RUNNING

# Describe task
TASK_ARN=$(aws ecs list-tasks --cluster citizen-science-cluster --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster citizen-science-cluster --tasks "$TASK_ARN" \
  --query 'tasks[0].{Status:lastStatus,Health:healthStatus,StoppedReason:stoppedReason}'
```

### Check Target Group Health

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names citizen-science-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
```

### View Application Logs

```bash
# Follow logs
aws logs tail /ecs/citizen-science-task --follow

# Recent logs
aws logs tail /ecs/citizen-science-task --since 30m

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/citizen-science-task \
  --filter-pattern "error" \
  --start-time $(($(date +%s) - 3600))000
```

### Test Endpoints

```bash
# Test NLB directly
curl -I http://citizen-science-nlb-0bc7103c85b818a5.elb.us-east-1.amazonaws.com/

# Test CloudFront
curl -I https://d35bp93zf2ayyg.cloudfront.net/

# Test with verbose output
curl -v https://d35bp93zf2ayyg.cloudfront.net/ 2>&1 | grep -E "(< HTTP|< x-cache|> Host:)"
```

## Common Error Messages

### "Task failed container health checks"

**Check**:
1. Is `wget` installed? (Check Dockerfile)
2. Is application running? (Check logs)
3. Is application accessible on localhost:3000? (Check logs)
4. Is health check timeout sufficient? (Check task definition)

### "exec format error"

**Check**:
1. Was image built with `--platform linux/amd64`?
2. Check image architecture: `docker inspect <image> | grep Architecture`

### "Error from cloudfront"

**Check**:
1. Is NLB accessible? (Test direct NLB URL)
2. Are ECS tasks running and healthy?
3. Is CloudFront origin configured correctly?
4. Is `DefaultRootObject` empty?

### "Connection refused" or Timeout

**Check**:
1. Are ECS tasks running?
2. Is security group allowing traffic?
3. Is application binding to `0.0.0.0:3000`?
4. Check target group health status

## Quick Fixes

### Restart ECS Service

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment
```

### Scale to Zero (Stop Service)

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --desired-count 0
```

### Scale Back Up

```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --desired-count 1
```

### Force New Task Definition

```bash
# Get current task definition
aws ecs describe-task-definition --task-definition citizen-science-task > task-def.json

# Register new revision (modify task-def.json first if needed)
aws ecs register-task-definition --cli-input-json file://task-def.json

# Update service to use new revision
LATEST_REV=$(aws ecs describe-task-definition --task-definition citizen-science-task --query 'taskDefinition.revision' --output text)
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --task-definition citizen-science-task:$LATEST_REV
```

## Prevention Checklist

Before deploying, ensure:

- [ ] Docker image built with `--platform linux/amd64`
- [ ] `wget` installed in Dockerfile
- [ ] `HOSTNAME=0.0.0.0` in Dockerfile
- [ ] Health check configured with sufficient `startPeriod` (90s)
- [ ] CloudFront `DefaultRootObject` is empty
- [ ] CloudFront origin points to correct NLB DNS
- [ ] Security groups allow necessary traffic
- [ ] ECR image pushed successfully

## Getting Help

1. Check logs first: `aws logs tail /ecs/citizen-science-task --follow`
2. Review service events: `aws ecs describe-services ...`
3. Check target health: `aws elbv2 describe-target-health ...`
4. Test endpoints directly (bypass CloudFront)
5. Review documentation:
   - [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)
   - [DEPLOYMENT.md](./DEPLOYMENT.md)
   - [DOCKER.md](./DOCKER.md)

