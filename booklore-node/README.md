# BookLore SaaS Backend

<div align="center">

![BookLore Logo](https://via.placeholder.com/200x80/2c3e50/ffffff?text=BookLore)

**A modern, scalable digital library management system built with NestJS**

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.x-red.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Features](#features) • [Quick Start](#quick-start) • [API Documentation](#api-documentation) • [Deployment](#deployment) • [Contributing](#contributing)

</div>

## 🚀 Features

### 📚 **Multi-Format Book Support**
- **EPUB**: Full metadata extraction, chapter parsing, cover images
- **PDF**: Document parsing, thumbnail generation, text extraction
- **CBX**: Comic book support (CBZ/CBR/CB7) with page-by-page reading

### 🔍 **Advanced Metadata Management**
- **Multi-Source Integration**: Google Books, Goodreads, Amazon APIs
- **Intelligent Matching**: AI-powered metadata matching with confidence scoring
- **Batch Operations**: Template-based bulk editing and updates
- **Change History**: Complete audit trail with rollback capabilities

### 🏢 **Multi-Tenant Library System**
- **Role-Based Access**: Admin, Editor, Reader permissions
- **Library Sharing**: Public/private libraries with member management
- **Shelf Organization**: Hierarchical book organization
- **Cross-Library Movement**: Secure file movement with transaction support

### ⚡ **Real-Time Processing**
- **WebSocket Notifications**: Live progress updates and status sync
- **Queue Management**: BullMQ-powered background processing
- **File Monitoring**: BookDrop automatic import system
- **Progress Tracking**: Detailed operation progress with ETA

### 🔐 **Enterprise Security**
- **JWT Authentication**: Access and refresh token support
- **RBAC Authorization**: Fine-grained permission system
- **Subscription Control**: Stripe-integrated billing and access control
- **API Rate Limiting**: Multi-tier rate limiting protection

### 🌐 **Integration & Compatibility**
- **OPDS Protocol**: E-reader compatibility (Calibre, KyBook, etc.)
- **Email Sharing**: SMTP-based book sharing with templates
- **REST API**: 100% backward-compatible with existing clients
- **WebSocket API**: Real-time bidirectional communication

### 📊 **Monitoring & Performance**
- **Health Checks**: Comprehensive system health monitoring
- **Performance Metrics**: Prometheus-compatible metrics
- **Memory Optimization**: Automatic memory management and GC tuning
- **Error Tracking**: Structured logging with error aggregation

## 🏃‍♂️ Quick Start

### Prerequisites

- **Node.js** 20.x or higher
- **PostgreSQL** 15 or higher
- **Redis** 7 or higher
- **pnpm** (recommended) or npm

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/booklore-app/booklore-node.git
cd booklore-node

# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` file with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/booklore"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Stripe (for subscriptions)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# External APIs (optional)
GOOGLE_BOOKS_API_KEY=your-google-books-key
GOODREADS_API_KEY=your-goodreads-key

# File Storage
STORAGE_PATH=/path/to/storage
BOOKDROP_PATH=/path/to/bookdrop

# Application
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### 3. Database Setup

```bash
# Start PostgreSQL and Redis (using Docker)
docker compose up -d postgres redis

# Run database migrations
pnpm prisma migrate dev

# Seed initial data (optional)
pnpm prisma db seed
```

### 4. Start Development Server

```bash
# Start the application
pnpm dev

# Or with debugging
pnpm dev:debug
```

The application will be available at:
- **API**: http://localhost:3000
- **Documentation**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/health

## 📖 API Documentation

### Swagger/OpenAPI

Interactive API documentation is available at `/api/docs` when running in development mode.

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer <your-jwt-token>" \
     http://localhost:3000/api/v1/books
```

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/refresh` - Refresh JWT token

#### Books
- `GET /api/v1/books` - List books
- `POST /api/v1/books` - Upload new book
- `GET /api/v1/books/:id` - Get book details
- `PUT /api/v1/books/:id` - Update book metadata
- `DELETE /api/v1/books/:id` - Delete book

#### Libraries
- `GET /api/v1/libraries` - List libraries
- `POST /api/v1/libraries` - Create library
- `GET /api/v1/libraries/:id/books` - List library books
- `POST /api/v1/libraries/:id/invite` - Invite user to library

#### File Management
- `POST /api/v1/file-management/move` - Move single file
- `POST /api/v1/file-management/bulk-move` - Bulk move files
- `GET /api/v1/file-management/progress/:id` - Get movement progress
- `POST /api/v1/file-management/rollback` - Rollback transaction

#### Metadata
- `POST /api/v1/metadata/search` - Search metadata across sources
- `PUT /api/v1/metadata/books/:id` - Update book metadata
- `POST /api/v1/metadata/books/bulk-update` - Bulk metadata update
- `GET /api/v1/metadata/history` - Get metadata change history

#### OPDS
- `GET /opds/catalog` - OPDS catalog root
- `GET /opds/libraries/:id` - Library OPDS feed
- `GET /opds/search` - OPDS search

### Rate Limits

- **Short**: 10 requests per second
- **Medium**: 100 requests per minute  
- **Long**: 1000 requests per 15 minutes

### Error Responses

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/books"
}
```

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f app

# Stop services
docker compose down
```

### Production Deployment

```bash
# Build production image
docker build -t booklore-api .

# Run with environment variables
docker run -d \
  --name booklore-api \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_HOST="redis" \
  booklore-api
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -l app=booklore-api

# View logs
kubectl logs -f deployment/booklore-api
```

## 🔧 Development

### Project Structure

```
src/
├── auth/                 # Authentication & authorization
├── book/                 # Book management & parsing
├── library/              # Library management
├── upload/               # File upload & processing
├── subscription/         # Billing & subscriptions
├── websocket/            # Real-time notifications
├── opds/                 # OPDS protocol support
├── email/                # Email services
├── bookdrop/             # Batch import system
├── metadata/             # Advanced metadata management
├── file-management/      # Cross-library file operations
├── shared/               # Shared utilities & services
└── main.ts              # Application entry point
```

### Available Scripts

```bash
# Development
pnpm dev                 # Start development server
pnpm dev:debug          # Start with debugging
pnpm dev:watch          # Start with file watching

# Testing
pnpm test               # Run unit tests
pnpm test:watch         # Run tests in watch mode
pnpm test:cov           # Run tests with coverage
pnpm test:e2e           # Run end-to-end tests

# Building
pnpm build              # Build for production
pnpm start              # Start production server

# Database
pnpm prisma:generate    # Generate Prisma client
pnpm prisma:migrate     # Run migrations
pnpm prisma:studio      # Open Prisma Studio

# Linting & Formatting
pnpm lint               # Run ESLint
pnpm lint:fix           # Fix ESLint issues
pnpm format             # Format code with Prettier

# Performance
pnpm perf:test          # Run performance tests
pnpm perf:profile       # Profile application
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- src/auth/auth.service.spec.ts

# Run tests with coverage
pnpm test:cov

# Run E2E tests
pnpm test:e2e
```

### Database Operations

```bash
# Create new migration
pnpm prisma migrate dev --name add_new_feature

# Reset database
pnpm prisma migrate reset

# View database in browser
pnpm prisma studio

# Generate Prisma client
pnpm prisma generate
```

## 🚀 Production Deployment

### Environment Variables

Ensure all required environment variables are set:

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_HOST=redis-server
JWT_SECRET=your-production-secret

# Optional but recommended
STRIPE_SECRET_KEY=sk_live_...
GOOGLE_BOOKS_API_KEY=...
SENTRY_DSN=https://...
```

### Health Checks

The application provides several health check endpoints:

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status
- `GET /metrics` - Prometheus metrics
- `GET /performance` - Performance statistics

### Monitoring

#### Prometheus Metrics

Available at `/metrics`:

- HTTP request duration and count
- Database connection pool status
- Queue job statistics
- Memory usage and GC metrics
- Custom business metrics

#### Logging

Structured JSON logging with configurable levels:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "context": "BookService",
  "message": "Book processed successfully",
  "bookId": 123,
  "userId": 456,
  "duration": 1500
}
```

### Performance Tuning

#### Memory Optimization

```bash
# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=2048"

# Enable memory monitoring
export ENABLE_MEMORY_MONITORING=true
```

#### Database Optimization

```sql
-- Recommended PostgreSQL settings
shared_preload_libraries = 'pg_stat_statements'
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
```

#### Redis Configuration

```redis
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

## 🔍 Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database connectivity
pnpm prisma db pull

# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT version();"
```

#### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis memory usage
redis-cli info memory
```

#### File Upload Issues

```bash
# Check storage permissions
ls -la $STORAGE_PATH

# Verify disk space
df -h $STORAGE_PATH

# Check file size limits
grep -r "maxFileSize" src/
```

#### Performance Issues

```bash
# Check memory usage
node --inspect src/main.js

# Profile application
pnpm perf:profile

# Monitor database queries
tail -f /var/log/postgresql/postgresql.log
```

### Debug Mode

Enable debug logging:

```bash
export DEBUG=booklore:*
export LOG_LEVEL=debug
pnpm dev:debug
```

### Error Tracking

Integration with error tracking services:

```bash
# Sentry integration
export SENTRY_DSN=https://your-sentry-dsn

# Custom error tracking
export ERROR_WEBHOOK_URL=https://your-webhook-url
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `pnpm test`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check code style
pnpm lint

# Fix formatting issues
pnpm lint:fix
pnpm format
```

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new book parsing feature
fix: resolve memory leak in file processing
docs: update API documentation
test: add unit tests for metadata service
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [BullMQ](https://bullmq.io/) - Premium Queue package
- [Socket.IO](https://socket.io/) - Real-time communication
- [Stripe](https://stripe.com/) - Payment processing

## 📞 Support

- **Documentation**: [API Docs](http://localhost:3000/api/docs)
- **Issues**: [GitHub Issues](https://github.com/booklore-app/booklore-node/issues)
- **Discussions**: [GitHub Discussions](https://github.com/booklore-app/booklore-node/discussions)
- **Email**: support@booklore.app

---

<div align="center">

**[⬆ Back to Top](#booklore-saas-backend)**

Made with ❤️ by the BookLore Team

</div>