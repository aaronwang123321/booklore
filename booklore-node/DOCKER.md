# Docker & CI/CD Setup Guide

This document provides comprehensive information about the Docker containerization and CI/CD pipeline setup for BookLore.

## 🐳 Docker Configuration

### Multi-Stage Dockerfile

The project uses a multi-stage Dockerfile optimized for production:

- **Stage 1 (Builder)**: Installs dependencies, builds TypeScript, and generates Prisma client
- **Stage 2 (Runtime)**: Creates minimal production image with only necessary files

Key features:
- Based on `node:20-alpine` for minimal size
- Non-root user for security
- Health checks included
- Optimized for size (target: ≤120MB)

### Building the Docker Image

```bash
# Build the image
docker build -t booklore-node:latest .

# Check image size
docker images booklore-node:latest

# Run the container
docker run -p 3000:3000 booklore-node:latest
```

### Docker Compose

Two Docker Compose configurations are provided:

#### Development (`docker-compose.yml`)
```bash
# Start all services
docker-compose up -d

# Start with development tools (Redis Commander, pgAdmin)
docker-compose --profile dev up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

#### Production (`docker-compose.prod.yml`)
```bash
# Deploy to production
docker-compose -f docker-compose.prod.yml up -d

# Scale the application
docker-compose -f docker-compose.prod.yml up -d --scale app=3
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline includes the following stages:

1. **Test & Quality Checks**
   - Code formatting and linting
   - Unit and E2E tests
   - Test coverage validation (≥80%)
   - TypeScript compilation

2. **Security Scanning**
   - Dependency vulnerability scanning
   - Snyk security analysis

3. **Build & Push**
   - Multi-platform Docker image build (amd64, arm64)
   - Image size validation (≤120MB)
   - Push to GitHub Container Registry

4. **Deploy**
   - Staging deployment (develop branch)
   - Production deployment (main branch)
   - Health checks and smoke tests

### Environment Variables

Required environment variables for CI/CD:

```bash
# GitHub Secrets
GITHUB_TOKEN          # Automatic
CODECOV_TOKEN         # Code coverage reporting
SNYK_TOKEN           # Security scanning
SLACK_WEBHOOK        # Deployment notifications

# Container Registry
GHCR_USERNAME        # GitHub username
GHCR_TOKEN          # GitHub personal access token
```

### Deployment Environments

#### Staging
- Triggered on: Push to `develop` branch
- Environment: `staging`
- URL: `http://staging.booklore.com`

#### Production
- Triggered on: Push to `main` branch or release
- Environment: `production`
- URL: `https://api.booklore.com`

## ☸️ Kubernetes Deployment

### Prerequisites

```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Install Helm (optional)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Deployment Steps

1. **Create Namespace**
```bash
kubectl apply -f k8s/namespace.yaml
```

2. **Configure Secrets**
```bash
# Update secrets with actual values
kubectl apply -f k8s/secret.yaml
```

3. **Deploy Application**
```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n booklore
kubectl get services -n booklore
```

4. **Configure Ingress**
```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# Apply ingress configuration
kubectl apply -f k8s/ingress.yaml
```

### Monitoring

```bash
# Check pod status
kubectl get pods -n booklore -w

# View logs
kubectl logs -f deployment/booklore-app -n booklore

# Check HPA status
kubectl get hpa -n booklore

# Port forward for local access
kubectl port-forward service/booklore-app-service 3000:80 -n booklore
```

## 🔧 Deployment Scripts

### Automated Deployment

```bash
# Deploy to staging
./scripts/deploy.sh staging v1.0.0

# Deploy to production
./scripts/deploy.sh production v1.0.0
```

### Manual Deployment

```bash
# Pull latest image
docker pull ghcr.io/booklore/booklore-node:latest

# Run database migrations
docker run --rm --network booklore-network \
  -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/booklore/booklore-node:latest \
  npx prisma migrate deploy

# Start application
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Performance Testing

### k6 Load Testing

```bash
# Install k6
sudo apt-get update
sudo apt-get install k6

# Run performance tests
k6 run scripts/performance-test.js

# Run with custom configuration
k6 run --vus 200 --duration 10m scripts/performance-test.js
```

### Performance Targets

- **Concurrent Users**: 1500
- **Response Time (P99)**: <200ms
- **Error Rate**: <1%
- **Throughput**: >1000 RPS

## 🔒 Security

### Container Security

- Non-root user execution
- Minimal base image (Alpine Linux)
- No unnecessary packages
- Security scanning in CI/CD

### Network Security

- HTTPS/TLS encryption
- Rate limiting
- CORS configuration
- Security headers

### Secrets Management

- Environment variables for sensitive data
- Kubernetes secrets for production
- No hardcoded credentials

## 🚨 Monitoring & Alerting

### Health Checks

- Container health checks
- Kubernetes liveness/readiness probes
- Application health endpoint (`/health`)

### Logging

- Structured JSON logging
- Log aggregation with ELK stack
- Error tracking with Sentry

### Metrics

- Prometheus metrics collection
- Grafana dashboards
- Custom application metrics

## 🔄 Rollback Procedures

### Docker Compose Rollback

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Deploy previous version
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Rollback

```bash
# Check rollout history
kubectl rollout history deployment/booklore-app -n booklore

# Rollback to previous version
kubectl rollout undo deployment/booklore-app -n booklore

# Rollback to specific revision
kubectl rollout undo deployment/booklore-app --to-revision=2 -n booklore
```

## 📝 Troubleshooting

### Common Issues

1. **Image Size Too Large**
   - Check .dockerignore exclusions
   - Verify multi-stage build
   - Remove unnecessary dependencies

2. **Container Won't Start**
   - Check environment variables
   - Verify database connectivity
   - Review container logs

3. **Health Check Failures**
   - Ensure application starts properly
   - Check port configuration
   - Verify health endpoint

4. **CI/CD Pipeline Failures**
   - Check test coverage
   - Verify environment secrets
   - Review build logs

### Debug Commands

```bash
# Check container logs
docker logs booklore-app

# Execute shell in container
docker exec -it booklore-app sh

# Check Kubernetes events
kubectl get events -n booklore --sort-by='.lastTimestamp'

# Debug pod issues
kubectl describe pod <pod-name> -n booklore
```

## 📚 Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [k6 Performance Testing](https://k6.io/docs/)

## 🤝 Contributing

When contributing to the Docker/CI-CD configuration:

1. Test changes locally with Docker Compose
2. Validate Kubernetes manifests with `kubectl --dry-run`
3. Update documentation for any configuration changes
4. Ensure CI/CD pipeline passes all checks