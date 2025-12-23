# Citizen Science Website

A Next.js website for Citizen Science Music, deployed on AWS using ECS Fargate, Network Load Balancer, and CloudFront.

**Live Site**: [citizensciencemusic.com](https://citizensciencemusic.com)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Deployment**: AWS ECS Fargate
- **CDN**: CloudFront
- **Load Balancer**: Network Load Balancer (NLB)
- **Infrastructure**: Terraform
- **Container**: Docker

## Architecture

```
Internet → CloudFront → NLB → ECS Fargate → Next.js App
```

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for detailed architecture documentation.

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

### Local Docker Testing

```bash
# Build Docker image
docker build --platform linux/amd64 -t citizen-science-website .

# Run container
docker run -p 3000:3000 citizen-science-website

# Or use docker-compose
docker-compose up
```

## Documentation

- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** - Complete infrastructure documentation, architecture, and configuration
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Step-by-step deployment guide
- **[DOCKER.md](./DOCKER.md)** - Docker configuration and build process
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

## Project Structure

```
.
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main page component
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── terraform/             # Infrastructure as Code
│   ├── main.tf           # Main infrastructure resources
│   ├── variables.tf      # Input variables
│   └── outputs.tf        # Output values
├── scripts/               # Helper scripts
│   ├── get-public-ip.sh  # Get ECS task public IP
│   └── update-cloudfront.sh # Update CloudFront origin
├── Dockerfile            # Docker image definition
├── docker-compose.yml    # Local development setup
└── next.config.ts        # Next.js configuration
```

## Deployment

### Quick Deploy

1. **Build and push Docker image**:
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build for production
docker build --platform linux/amd64 -t citizen-science-website .

# Tag and push
docker tag citizen-science-website:latest \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/citizen-science-website:latest
```

2. **Deploy to ECS**:
```bash
aws ecs update-service \
  --cluster citizen-science-cluster \
  --service citizen-science-service \
  --force-new-deployment \
  --region us-east-1
```

3. **Invalidate CloudFront cache**:
```bash
aws cloudfront create-invalidation \
  --distribution-id E2M1KYGNR5D6FH \
  --paths "/*"
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Infrastructure Management

Infrastructure is managed via Terraform:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for infrastructure details.

## Key Configuration Notes

### Docker

- **Platform**: Always build with `--platform linux/amd64` (ECS uses x86_64)
- **Health Check**: Requires `wget` installed (for ECS health checks)
- **Host Binding**: Must bind to `0.0.0.0:3000` (not `localhost`)

### CloudFront

- **DefaultRootObject**: Must be empty (`""`) for dynamic origins
- **Cache Policy**: Currently set to `CachingDisabled` for fresh content
- **Origin Request Policy**: `AllViewerExceptHostHeader`

### ECS

- **Health Check**: Uses `/usr/bin/wget` to check `http://localhost:3000`
- **Start Period**: 90 seconds (gives Next.js time to start)
- **Resources**: 256 CPU, 512MB RAM

## Troubleshooting

See **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** for comprehensive troubleshooting guide covering:
- Common issues and their solutions
- Diagnostic commands
- Quick fixes
- Prevention checklist

Additional troubleshooting sections:
- [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) - Deployment-specific issues
- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md#common-issues-and-solutions) - Infrastructure issues
- [DOCKER.md](./DOCKER.md#troubleshooting) - Docker build issues

## Cost

Current setup costs approximately **$15-22/month**:
- ECS Fargate: ~$10-15/month
- Network Load Balancer: ~$3-4/month
- CloudFront: ~$1-2/month
- Other services: ~$1/month

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
