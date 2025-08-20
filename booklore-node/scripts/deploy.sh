#!/bin/bash

# BookLore Deployment Script
# Usage: ./scripts/deploy.sh [environment] [version]
# Example: ./scripts/deploy.sh production v1.0.0

set -e

# Configuration
ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}
REGISTRY="ghcr.io"
IMAGE_NAME="booklore/booklore-node"
COMPOSE_FILE="docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate environment
validate_environment() {
    case $ENVIRONMENT in
        staging|production)
            log_info "Deploying to $ENVIRONMENT environment"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Set environment-specific configuration
setup_environment() {
    log_info "Setting up $ENVIRONMENT environment configuration..."
    
    case $ENVIRONMENT in
        staging)
            COMPOSE_FILE="docker-compose.yml"
            export NODE_ENV=staging
            export PORT=3000
            ;;
        production)
            COMPOSE_FILE="docker-compose.prod.yml"
            export NODE_ENV=production
            export PORT=3000
            ;;
    esac
    
    # Check if environment file exists
    if [ ! -f ".env.$ENVIRONMENT" ]; then
        log_warning "Environment file .env.$ENVIRONMENT not found, using .env"
        if [ ! -f ".env" ]; then
            log_error "No environment configuration found"
            exit 1
        fi
    else
        cp ".env.$ENVIRONMENT" ".env"
        log_info "Using .env.$ENVIRONMENT configuration"
    fi
}

# Pull latest images
pull_images() {
    log_info "Pulling latest images..."
    
    # Set the image tag
    export IMAGE_TAG="$REGISTRY/$IMAGE_NAME:$VERSION"
    
    # Pull the application image
    if ! docker pull "$IMAGE_TAG"; then
        log_error "Failed to pull image: $IMAGE_TAG"
        exit 1
    fi
    
    log_success "Images pulled successfully"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Create a temporary container to run migrations
    docker run --rm \
        --network booklore-network \
        -e DATABASE_URL="$DATABASE_URL" \
        "$IMAGE_TAG" \
        sh -c "npx prisma migrate deploy"
    
    log_success "Database migrations completed"
}

# Health check function
health_check() {
    local max_attempts=30
    local attempt=1
    local health_url="http://localhost:3000/health"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        health_url="https://api.booklore.com/health"
    fi
    
    log_info "Performing health check..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_url" > /dev/null; then
            log_success "Health check passed"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Deploy application
deploy() {
    log_info "Starting deployment..."
    
    # Stop existing containers
    log_info "Stopping existing containers..."
    docker-compose -f "$COMPOSE_FILE" down --remove-orphans
    
    # Start new containers
    log_info "Starting new containers..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 30
    
    # Run health check
    if ! health_check; then
        log_error "Deployment failed health check"
        rollback
        exit 1
    fi
    
    log_success "Deployment completed successfully"
}

# Rollback function
rollback() {
    log_warning "Rolling back deployment..."
    
    # Stop current containers
    docker-compose -f "$COMPOSE_FILE" down
    
    # You could implement more sophisticated rollback logic here
    # For example, keeping track of previous versions and rolling back to them
    
    log_info "Rollback completed"
}

# Cleanup old images
cleanup() {
    log_info "Cleaning up old images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images "$REGISTRY/$IMAGE_NAME" --format "table {{.Tag}}\t{{.ID}}" | \
        tail -n +4 | \
        awk '{print $2}' | \
        xargs -r docker rmi
    
    log_success "Cleanup completed"
}

# Main deployment flow
main() {
    log_info "Starting BookLore deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    
    validate_environment
    check_prerequisites
    setup_environment
    pull_images
    
    # Run migrations only for production
    if [ "$ENVIRONMENT" = "production" ]; then
        run_migrations
    fi
    
    deploy
    cleanup
    
    log_success "🎉 Deployment completed successfully!"
    log_info "Application is running at:"
    
    case $ENVIRONMENT in
        staging)
            log_info "  - Staging: http://staging.booklore.com"
            ;;
        production)
            log_info "  - Production: https://api.booklore.com"
            ;;
    esac
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"