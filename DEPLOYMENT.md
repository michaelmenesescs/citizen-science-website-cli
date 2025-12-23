# ECS Fargate Deployment Guide

This guide walks you through deploying the Citizen Science website to AWS ECS Fargate.

## Architecture Overview

```
GitHub → GitHub Actions → ECR (Docker Registry) → ECS Fargate (Public IP) → Users
```

**Cost-optimized setup**: No load balancer, single subnet, minimal resources (~$10-15/month)

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured (`aws configure`)
3. Docker installed (for local testing)
4. GitHub repository with Actions enabled

## Step 1: Create AWS Resources

### 1.1 Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name citizen-science-website \
  --region us-east-1
```

Note the repository URI (e.g., `123456789012.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website`)

### 1.2 Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name citizen-science-cluster \
  --region us-east-1
```

### 1.3 Create IAM Roles

**Execution Role** (allows ECS to pull images from ECR):

```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://trust-policy.json

# Attach managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**Task Role** (for the running container - minimal for now):

```bash
aws iam create-role \
  --role-name ecsTaskRole \
  --assume-role-policy-document file://trust-policy.json
```

### 1.4 Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/citizen-science-task \
  --region us-east-1
```

### 1.5 Get Default VPC and Subnet (Cost-Free)

Use AWS default VPC to avoid setup complexity:

```bash
# Get default VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
echo "Default VPC ID: $VPC_ID"

# Get default subnet (any one is fine for single instance)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text)
echo "Default Subnet ID: $SUBNET_ID"
```

### 1.6 Create Security Group

```bash
# Get default VPC ID first
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name citizen-science-sg \
  --description "Security group for Citizen Science website" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

echo "Security Group ID: $SG_ID"

# Allow HTTP traffic on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0

# Optional: Allow HTTPS if you add SSL later
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

**Note:** We're using direct public IP access (no load balancer) to save costs.

## Step 2: Update Task Definition

1. Open `ecs-task-definition.json`
2. Replace `YOUR_ACCOUNT_ID` with your AWS account ID (12 digits)
3. Update the image URI with your ECR repository URI
4. Update execution and task role ARNs with your account ID

### Register Task Definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region us-east-1
```

## Step 3: Create ECS Service

Create the service with direct public IP (no load balancer to save costs):

```bash
# Set variables (replace with your values from Step 1.5 and 1.6)
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text)
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=citizen-science-sg" --query "SecurityGroups[0].GroupId" --output text)

# Create ECS service
aws ecs create-service \
  --cluster citizen-science-cluster \
  --service-name citizen-science-service \
  --task-definition citizen-science-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region us-east-1
```

**Note:** Using single subnet and direct public IP - no load balancer needed for personal site.

## Step 4: Configure GitHub Secrets

In your GitHub repository, go to Settings → Secrets and variables → Actions, and add:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

**Create IAM User for GitHub Actions:**

```bash
aws iam create-user --user-name github-actions-deploy

# Create policy for ECS/ECR access
cat > github-actions-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole"
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name github-actions-deploy \
  --policy-name ECSDeployPolicy \
  --policy-document file://github-actions-policy.json

# Create access keys
aws iam create-access-key --user-name github-actions-deploy
```

## Step 5: Test Locally

```bash
# Build and test Docker image locally
docker build -t citizen-science-website .
docker run -p 3000:3000 citizen-science-website

# Or use docker-compose
docker-compose up
```

## Step 6: First Manual Deployment

```bash
# Get ECR login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t citizen-science-website .
docker tag citizen-science-website:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest

# Update service to force new deployment
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment \
  --region us-east-1
```

## Step 7: Verify Deployment

1. Check ECS service status:
```bash
aws ecs describe-services \
  --cluster citizen-science-cluster \
  --services citizen-science-service \
  --region us-east-1
```

2. Get task public IP:

**Easy way** (using helper script):
```bash
./scripts/get-public-ip.sh
```

**Manual way**:
```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks --cluster citizen-science-cluster --service-name citizen-science-service --query "taskArns[0]" --output text)

# Get network interface ID
NETWORK_INTERFACE_ID=$(aws ecs describe-tasks --cluster citizen-science-cluster --tasks $TASK_ARN --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)

# Get public IP
aws ec2 describe-network-interfaces --network-interface-ids $NETWORK_INTERFACE_ID --query "NetworkInterfaces[0].Association.PublicIp" --output text
```

3. Access your site at `http://<PUBLIC_IP>:3000`

**Note:** The public IP may change when the task restarts. For a stable URL, consider:
- Using Route 53 with a dynamic DNS script
- Or adding a simple CloudFront distribution (adds ~$1/month)

## Troubleshooting

### View Logs
```bash
aws logs tail /ecs/citizen-science-task --follow
```

### Check Task Status
```bash
aws ecs describe-tasks --cluster citizen-science-cluster --tasks <TASK_ID>
```

### Common Issues

1. **Task fails to start**: Check CloudWatch logs, verify IAM roles
2. **Can't pull image**: Verify ECR permissions on execution role
3. **Can't access site**: Check security group rules, verify public IP assignment
4. **Build fails in GitHub Actions**: Verify AWS credentials and region

## Cost Estimate (Minimal Setup)

- **ECS Fargate** (0.25 vCPU, 0.5GB RAM): ~$10-15/month
  - $0.04048 per vCPU-hour × 730 hours = ~$7.50
  - $0.004445 per GB-hour × 512MB × 730 hours = ~$1.66
- **ECR storage**: ~$0.10/GB/month (first 500MB free)
- **CloudWatch Logs**: First 5GB free, then $0.50/GB
- **Data transfer**: First 1GB free, then $0.09/GB
- **VPC/Networking**: Free (using default VPC)

**Total: ~$10-15/month** (assuming low traffic)

**Cost-saving tips:**
- No load balancer (saves $16/month)
- Single task instance (no HA)
- Minimal resources (256 CPU, 512MB RAM)
- Using default VPC (no extra networking costs)

## Next Steps (Optional)

- **Domain + SSL**: Use Route 53 + ACM certificate (free SSL, ~$0.50/month for domain)
- **CloudFront**: Add CDN for static assets (~$1/month, improves performance)
- **Auto-scaling**: Not needed for personal site, but can add if traffic grows
- **CloudWatch Alarms**: Monitor costs and uptime (free tier available)

## Important Notes

⚠️ **Public IP Changes**: The public IP will change when the task restarts. For a stable URL:
- Use a dynamic DNS service
- Or set up Route 53 with a script to update the A record
- Or use CloudFront (adds minimal cost but provides stable URL)

💡 **Stopping Costs**: To stop the service and save money:
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

