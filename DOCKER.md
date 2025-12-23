# Docker Configuration

This document describes the Docker setup for the Citizen Science website.

## Dockerfile Overview

The Dockerfile uses a multi-stage build pattern to optimize image size and build time.

### Build Stages

1. **base**: Node.js 20 Alpine base image
2. **deps**: Install dependencies (`npm ci`)
3. **builder**: Build Next.js application (`npm run build`)
4. **runner**: Production image with minimal dependencies

## Key Configuration

### Base Image

```dockerfile
FROM node:20-alpine AS base
```

- Uses Alpine Linux for smaller image size
- Node.js 20 LTS

### Dependencies Stage

```dockerfile
FROM base AS deps
RUN apk add --no-cache libc6-compat
```

- Installs `libc6-compat` for compatibility with some npm packages
- Runs `npm ci` for reproducible builds

### Builder Stage

```dockerfile
FROM base AS builder
RUN npm run build
```

- Builds Next.js application
- Generates standalone output for production

### Runner Stage

```dockerfile
FROM base AS runner
RUN apk add --no-cache wget
```

**Critical**: Installs `wget` for ECS health checks. This is required!

```dockerfile
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs
```

- Creates non-root user for security
- Runs application as `nextjs` user (UID 1001)

```dockerfile
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
```

- Sets port to 3000
- **Critical**: Binds to `0.0.0.0` (not `localhost`) so it's accessible from outside container

## Building the Image

### Local Development

```bash
# Build for local testing
docker build -t citizen-science-website .

# Run locally
docker run -p 3000:3000 citizen-science-website
```

### Production Build

**IMPORTANT**: Always build for `linux/amd64` architecture:

```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

**Why?** ECS Fargate uses x86_64 architecture. If you build on an ARM Mac without the `--platform` flag, the image will be ARM64 and fail with "exec format error" in ECS.

### Testing the Image

```bash
# Build
docker build --platform linux/amd64 -t citizen-science-website .

# Test health check command
docker run --rm citizen-science-website \
  /usr/bin/wget --no-verbose --tries=1 --spider http://localhost:3000

# Test application
docker run -p 3000:3000 citizen-science-website
curl http://localhost:3000
```

## Image Optimization

### Current Size

The multi-stage build significantly reduces final image size by:
- Only including production dependencies
- Using Alpine Linux base
- Copying only necessary files

### Further Optimization (Future)

- Use `next/image` for optimized images
- Enable Next.js standalone output (already enabled)
- Consider using distroless images
- Multi-arch builds for ARM support

## Health Check

The Docker image must support the ECS health check:

```json
{
  "command": ["CMD-SHELL", "/usr/bin/wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1"]
}
```

**Requirements**:
- `wget` must be installed (done in runner stage)
- Application must be accessible on `localhost:3000`
- Application must start within health check `startPeriod` (90 seconds)

## Environment Variables

### Required

- `NODE_ENV=production` - Set in Dockerfile
- `PORT=3000` - Set in Dockerfile
- `HOSTNAME=0.0.0.0` - Set in Dockerfile (critical for accessibility)

### Optional

Can be added via ECS task definition:
- `NEXT_PUBLIC_*` - Public environment variables for Next.js
- Custom application variables

## Troubleshooting

### Issue: "exec format error"

**Cause**: Image built for wrong architecture

**Solution**: Always use `--platform linux/amd64`:
```bash
docker build --platform linux/amd64 -t citizen-science-website .
```

### Issue: Health check fails

**Causes**:
- `wget` not installed
- Application not binding to `0.0.0.0`
- Application not starting in time

**Solutions**:
- Verify `wget` installation in Dockerfile
- Check `HOSTNAME` env var is `0.0.0.0`
- Increase health check `startPeriod` if needed
- Review application logs

### Issue: Application not accessible

**Cause**: Binding to `localhost` instead of `0.0.0.0`

**Solution**: Ensure `HOSTNAME=0.0.0.0` in Dockerfile

## Docker Compose

For local development, use `docker-compose.yml`:

```bash
docker-compose up
```

This runs the application with proper port mapping and environment variables.

## Best Practices

1. **Always build for correct platform**: Use `--platform linux/amd64` for production
2. **Use multi-stage builds**: Reduces final image size
3. **Run as non-root**: Security best practice
4. **Minimize layers**: Combine RUN commands where possible
5. **Use .dockerignore**: Exclude unnecessary files from build context
6. **Tag images properly**: Use semantic versioning or commit hashes
7. **Test locally first**: Always test Docker image before pushing to ECR

## Future Improvements

- [ ] Add health check endpoint in Next.js (instead of relying on wget)
- [ ] Use distroless base image for better security
- [ ] Implement image scanning in CI/CD
- [ ] Add build cache optimization
- [ ] Support multi-arch builds (ARM + x86)

