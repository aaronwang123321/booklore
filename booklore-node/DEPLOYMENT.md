# BookLore Deployment Guide

This guide covers various deployment scenarios for the BookLore SaaS backend, from development to production environments.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements

**Minimum Requirements:**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: 100 Mbps

**Recommended for Production:**
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 100GB+ SSD
- **Network**: 1 Gbps

### Software Dependencies

- **Node.js**: 20.x or higher
- **PostgreSQL**: 15 or higher
- **Redis**: 7 or higher
- **Docker**: 24.x or higher (for containerized deployment)
- **Kubernetes**: 1.28+ (for K8s deployment)

## 🌍 Environment Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

#### Core Configuration

```env
# Application
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-domain.com

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/booklore"
DATABASE_POOL_SIZE=20

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret-key-min-32-chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# File Storage
STORAGE_PATH=/var/lib/booklore/storage
BOOKDROP_PATH=/var/lib/booklore/bookdrop
MAX_FILE_SIZE=100MB
ALLOWED_FILE_TYPES=epub,pdf,cbz,cbr,cb7
```

#### External Services

```env
# Stripe (Subscription Management)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key

# Email (SMTP)
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-email-password
SMTP_FROM="BookLore <noreply@your-domain.com>"

# Metadata APIs (Optional)
GOOGLE_BOOKS_API_KEY=your-google-books-api-key
GOODREADS_API_KEY=your-goodreads-api-key
AMAZON_ACCESS_KEY=your-amazon-access-key
AMAZON_SECRET_KEY=your-amazon-secret-key
AMAZON_ASSOCIATE_TAG=your-associate-tag
```

#### Monitoring & Logging

```env
# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_TIMEOUT=5000

# Error Tracking (Optional)
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ENVIRONMENT=production

# Performance Monitoring
ENABLE_MEMORY_MONITORING=true
MEMORY_THRESHOLD_MB=1024
GC_OPTIMIZATION=true
```

## 🏠 Development Deployment

### Local Development Setup

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start Services**
   ```bash
   # Using Docker Compose
   docker compose up -d postgres redis
   
   # Or install locally
   # PostgreSQL and Redis installation varies by OS
   ```

3. **Database Setup**
   ```bash
   # Run migrations
   pnpm prisma migrate dev
   
   # Seed data (optional)
   pnpm prisma db seed
   ```

4. **Start Application**
   ```bash
   # Development mode with hot reload
   pnpm dev
   
   # Debug mode
   pnpm dev:debug
   ```

### Development Tools

```bash
# Database management
pnpm prisma studio

# API testing
curl http://localhost:3000/health

# View logs
tail -f logs/application.log
```

## 🚀 Production Deployment

### Server Preparation

1. **System Updates**
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt upgrade -y
   
   # CentOS/RHEL
   sudo yum update -y
   ```

2. **Install Node.js**
   ```bash
   # Using NodeSource repository
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install pnpm
   npm install -g pnpm
   ```

3. **Install PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   
   # Configure PostgreSQL
   sudo -u postgres createuser --interactive booklore
   sudo -u postgres createdb booklore
   ```

4. **Install Redis**
   ```bash
   # Ubuntu/Debian
   sudo apt install redis-server
   
   # Configure Redis
   sudo systemctl enable redis-server
   sudo systemctl start redis-server
   ```

### Application Deployment

1. **Create Application User**
   ```bash
   sudo useradd -m -s /bin/bash booklore
   sudo mkdir -p /var/lib/booklore/{storage,bookdrop,logs}
   sudo chown -R booklore:booklore /var/lib/booklore
   ```

2. **Deploy Application**
   ```bash
   # Switch to application user
   sudo su - booklore
   
   # Clone repository
   git clone https://github.com/booklore-app/booklore-node.git
   cd booklore-node
   
   # Install dependencies
   pnpm install --frozen-lockfile
   
   # Build application
   pnpm build
   
   # Set up environment
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Database Migration**
   ```bash
   # Run migrations
   pnpm prisma migrate deploy
   
   # Generate Prisma client
   pnpm prisma generate
   ```

4. **Create Systemd Service**
   ```bash
   sudo tee /etc/systemd/system/booklore.service > /dev/null <<EOF
   [Unit]
   Description=BookLore API Server
   After=network.target postgresql.service redis.service
   
   [Service]
   Type=simple
   User=booklore
   WorkingDirectory=/home/booklore/booklore-node
   Environment=NODE_ENV=production
   EnvironmentFile=/home/booklore/booklore-node/.env
   ExecStart=/usr/bin/node dist/main.js
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=booklore
   
   [Install]
   WantedBy=multi-user.target
   EOF
   
   # Enable and start service
   sudo systemctl enable booklore
   sudo systemctl start booklore
   ```

### Reverse Proxy Setup (Nginx)

```bash
# Install Nginx
sudo apt install nginx

# Create configuration
sudo tee /etc/nginx/sites-available/booklore > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    
    # Rate Limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    
    # Main API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # WebSocket Support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health Check
    location /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
    
    # Static Files (if serving directly)
    location /static/ {
        alias /var/lib/booklore/storage/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/booklore /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🐳 Docker Deployment

### Single Container Deployment

1. **Build Image**
   ```bash
   docker build -t booklore-api:latest .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name booklore-api \
     -p 3000:3000 \
     -e DATABASE_URL="postgresql://user:pass@host:5432/booklore" \
     -e REDIS_HOST="redis-host" \
     -e JWT_SECRET="your-jwt-secret" \
     -v /var/lib/booklore/storage:/app/storage \
     -v /var/lib/booklore/logs:/app/logs \
     --restart unless-stopped \
     booklore-api:latest
   ```

### Docker Compose Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://booklore:${DB_PASSWORD}@postgres:5432/booklore
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - storage_data:/app/storage
      - logs_data:/app/logs
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=booklore
      - POSTGRES_USER=booklore
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U booklore"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  storage_data:
  logs_data:
```

Deploy with:
```bash
docker compose -f docker-compose.prod.yml up -d
```

## ☸️ Kubernetes Deployment

### Namespace and ConfigMap

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: booklore

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: booklore-config
  namespace: booklore
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  CORS_ORIGIN: "https://your-domain.com"
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: booklore-secrets
  namespace: booklore
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres:5432/booklore"
  JWT_SECRET: "your-super-secure-jwt-secret"
  REDIS_PASSWORD: "your-redis-password"
  STRIPE_SECRET_KEY: "sk_live_your_stripe_key"
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: booklore-api
  namespace: booklore
spec:
  replicas: 3
  selector:
    matchLabels:
      app: booklore-api
  template:
    metadata:
      labels:
        app: booklore-api
    spec:
      containers:
      - name: booklore-api
        image: booklore-api:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: booklore-config
        - secretRef:
            name: booklore-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: storage
          mountPath: /app/storage
      volumes:
      - name: storage
        persistentVolumeClaim:
          claimName: booklore-storage-pvc

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: booklore-api-service
  namespace: booklore
spec:
  selector:
    app: booklore-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: booklore-ingress
  namespace: booklore
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: booklore-tls
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: booklore-api-service
            port:
              number: 80
```

### Persistent Volume

```yaml
# k8s/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: booklore-storage-pvc
  namespace: booklore
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 100Gi
  storageClassName: fast-ssd
```

### Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n booklore

# View logs
kubectl logs -f deployment/booklore-api -n booklore

# Scale deployment
kubectl scale deployment booklore-api --replicas=5 -n booklore
```

## ☁️ Cloud Deployment

### AWS Deployment

#### Using ECS Fargate

```json
{
  "family": "booklore-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "booklore-api",
      "image": "your-account.dkr.ecr.region.amazonaws.com/booklore-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:booklore/database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/booklore-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### Using Elastic Beanstalk

```json
{
  "AWSEBDockerrunVersion": 2,
  "containerDefinitions": [
    {
      "name": "booklore-api",
      "image": "booklore-api:latest",
      "essential": true,
      "memory": 1024,
      "portMappings": [
        {
          "hostPort": 80,
          "containerPort": 3000
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ]
    }
  ]
}
```

### Google Cloud Platform

#### Using Cloud Run

```yaml
# cloudrun.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: booklore-api
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 100
      containers:
      - image: gcr.io/your-project/booklore-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: booklore-secrets
              key: database-url
        resources:
          limits:
            cpu: "1"
            memory: "1Gi"
```

Deploy with:
```bash
gcloud run services replace cloudrun.yaml
```

### Azure Container Instances

```yaml
# azure-container-group.yaml
apiVersion: 2019-12-01
location: eastus
name: booklore-api
properties:
  containers:
  - name: booklore-api
    properties:
      image: your-registry.azurecr.io/booklore-api:latest
      resources:
        requests:
          cpu: 1
          memoryInGb: 1
      ports:
      - port: 3000
        protocol: TCP
      environmentVariables:
      - name: NODE_ENV
        value: production
      - name: DATABASE_URL
        secureValue: postgresql://...
  osType: Linux
  restartPolicy: Always
  ipAddress:
    type: Public
    ports:
    - protocol: tcp
      port: 3000
tags: {}
type: Microsoft.ContainerInstance/containerGroups
```

## 📊 Monitoring & Maintenance

### Health Monitoring

```bash
# Basic health check
curl http://your-domain.com/health

# Detailed health check
curl http://your-domain.com/health/detailed

# Metrics endpoint
curl http://your-domain.com/metrics
```

### Log Management

```bash
# View application logs
sudo journalctl -u booklore -f

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### Database Maintenance

```bash
# Backup database
pg_dump -h localhost -U booklore booklore > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
psql -h localhost -U booklore booklore < backup_20240101_120000.sql

# Vacuum and analyze
psql -h localhost -U booklore -d booklore -c "VACUUM ANALYZE;"
```

### Performance Monitoring

```bash
# Monitor system resources
htop
iotop
nethogs

# Monitor application performance
curl http://your-domain.com/performance

# Database performance
psql -h localhost -U booklore -d booklore -c "
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;"
```

### Automated Backups

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/booklore"
DB_NAME="booklore"
DB_USER="booklore"

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# File storage backup
tar -czf $BACKUP_DIR/storage_backup_$DATE.tar.gz /var/lib/booklore/storage

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup.sh
```

## 🔧 Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check service status
sudo systemctl status booklore

# View logs
sudo journalctl -u booklore -n 50

# Check port availability
sudo netstat -tlnp | grep :3000

# Verify environment variables
sudo -u booklore env | grep -E "(DATABASE_URL|REDIS_HOST|JWT_SECRET)"
```

#### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check PostgreSQL status
sudo systemctl status postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log

# Check connection limits
psql -h localhost -U booklore -d booklore -c "
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';"
```

#### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis status
sudo systemctl status redis

# Monitor Redis
redis-cli monitor

# Check memory usage
redis-cli info memory
```

#### High Memory Usage

```bash
# Check Node.js memory usage
ps aux | grep node

# Enable heap profiling
node --inspect --heap-prof dist/main.js

# Analyze heap dump
node --inspect-brk dist/main.js
# Then use Chrome DevTools
```

#### Performance Issues

```bash
# Check system load
uptime
iostat 1 5

# Monitor database queries
psql -h localhost -U booklore -d booklore -c "
SELECT query, calls, total_time, mean_time, rows
FROM pg_stat_statements 
WHERE calls > 100
ORDER BY mean_time DESC 
LIMIT 10;"

# Check slow queries
tail -f /var/log/postgresql/postgresql-15-main.log | grep "slow query"
```

### Emergency Procedures

#### Service Recovery

```bash
# Restart application
sudo systemctl restart booklore

# Restart database
sudo systemctl restart postgresql

# Restart Redis
sudo systemctl restart redis

# Restart Nginx
sudo systemctl restart nginx
```

#### Database Recovery

```bash
# Stop application
sudo systemctl stop booklore

# Restore from backup
psql -h localhost -U booklore -d booklore < /var/backups/booklore/db_backup_latest.sql

# Start application
sudo systemctl start booklore
```

#### Rollback Deployment

```bash
# Docker rollback
docker stop booklore-api
docker run -d --name booklore-api booklore-api:previous-version

# Kubernetes rollback
kubectl rollout undo deployment/booklore-api -n booklore

# Systemd rollback
sudo systemctl stop booklore
# Replace with previous version
sudo systemctl start booklore
```

### Support Contacts

- **Technical Issues**: Create an issue on GitHub
- **Security Issues**: security@booklore.app
- **General Support**: support@booklore.app

---

This deployment guide covers most common scenarios. For specific cloud providers or custom setups, refer to their respective documentation or contact support.