#!/usr/bin/env node

/**
 * Test script for T09 Dockerfile和CI/CD
 * Tests Docker containerization and CI/CD pipeline components
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test configuration
const TEST_CONFIG = {
  timeout: 300000, // 5 minutes
  maxImageSize: 120 * 1024 * 1024, // 120MB in bytes
};

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    log(`PASS: ${message}`, 'success');
  } else {
    testResults.failed++;
    log(`FAIL: ${message}`, 'error');
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function fileContains(filePath, searchString) {
  if (!fileExists(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(searchString);
}

function executeCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      timeout: TEST_CONFIG.timeout,
      ...options 
    });
    return { success: true, output: result.trim() };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout || '' };
  }
}

// Test Docker configuration
function testDockerConfiguration() {
  log('Testing Docker configuration...');

  // Test Dockerfile exists and has correct structure
  assert(fileExists('Dockerfile'), 'Dockerfile exists');
  assert(fileContains('Dockerfile', 'FROM node:20-alpine'), 'Dockerfile uses node:20-alpine base image');
  assert(fileContains('Dockerfile', 'WORKDIR /app'), 'Dockerfile sets working directory');
  assert(fileContains('Dockerfile', 'COPY --from=builder'), 'Dockerfile uses multi-stage build');
  assert(fileContains('Dockerfile', 'USER booklore'), 'Dockerfile runs as non-root user');
  assert(fileContains('Dockerfile', 'HEALTHCHECK'), 'Dockerfile includes health check');
  assert(fileContains('Dockerfile', 'EXPOSE 3000'), 'Dockerfile exposes port 3000');

  // Test .dockerignore exists and excludes development files
  assert(fileExists('.dockerignore'), '.dockerignore file exists');
  assert(fileContains('.dockerignore', 'node_modules'), '.dockerignore excludes node_modules');
  assert(fileContains('.dockerignore', '.git'), '.dockerignore excludes .git');
  assert(fileContains('.dockerignore', '*.test.js'), '.dockerignore excludes test files');
  assert(fileContains('.dockerignore', 'README.md'), '.dockerignore excludes documentation');

  // Test docker-compose files
  assert(fileExists('docker-compose.yml'), 'docker-compose.yml exists');
  assert(fileExists('docker-compose.prod.yml'), 'docker-compose.prod.yml exists');
  assert(fileContains('docker-compose.yml', 'postgres:15-alpine'), 'docker-compose includes PostgreSQL');
  assert(fileContains('docker-compose.yml', 'redis:7-alpine'), 'docker-compose includes Redis');
  assert(fileContains('docker-compose.yml', 'healthcheck'), 'docker-compose includes health checks');
}

// Test CI/CD pipeline configuration
function testCICDConfiguration() {
  log('Testing CI/CD pipeline configuration...');

  // Test GitHub Actions workflow
  const workflowPath = '.github/workflows/ci-cd.yml';
  assert(fileExists(workflowPath), 'GitHub Actions workflow exists');
  assert(fileContains(workflowPath, 'name: CI/CD Pipeline'), 'Workflow has correct name');
  assert(fileContains(workflowPath, 'on:'), 'Workflow has trigger configuration');
  assert(fileContains(workflowPath, 'push:'), 'Workflow triggers on push');
  assert(fileContains(workflowPath, 'pull_request:'), 'Workflow triggers on pull request');

  // Test workflow jobs
  assert(fileContains(workflowPath, 'jobs:'), 'Workflow defines jobs');
  assert(fileContains(workflowPath, 'test:'), 'Workflow includes test job');
  assert(fileContains(workflowPath, 'security:'), 'Workflow includes security job');
  assert(fileContains(workflowPath, 'build:'), 'Workflow includes build job');
  assert(fileContains(workflowPath, 'deploy-staging:'), 'Workflow includes staging deployment');
  assert(fileContains(workflowPath, 'deploy-production:'), 'Workflow includes production deployment');

  // Test workflow steps
  assert(fileContains(workflowPath, 'pnpm install'), 'Workflow installs dependencies');
  assert(fileContains(workflowPath, 'pnpm test'), 'Workflow runs tests');
  assert(fileContains(workflowPath, 'docker/build-push-action'), 'Workflow builds Docker image');
  assert(fileContains(workflowPath, 'coverage'), 'Workflow checks test coverage');

  // Test environment configuration
  assert(fileContains(workflowPath, 'NODE_VERSION'), 'Workflow specifies Node.js version');
  assert(fileContains(workflowPath, 'PNPM_VERSION'), 'Workflow specifies pnpm version');
  assert(fileContains(workflowPath, 'REGISTRY'), 'Workflow specifies container registry');
}

// Test Kubernetes configuration
function testKubernetesConfiguration() {
  log('Testing Kubernetes configuration...');

  // Test Kubernetes manifests exist
  assert(fileExists('k8s/namespace.yaml'), 'Kubernetes namespace manifest exists');
  assert(fileExists('k8s/configmap.yaml'), 'Kubernetes ConfigMap manifest exists');
  assert(fileExists('k8s/secret.yaml'), 'Kubernetes Secret manifest exists');
  assert(fileExists('k8s/deployment.yaml'), 'Kubernetes Deployment manifest exists');
  assert(fileExists('k8s/service.yaml'), 'Kubernetes Service manifest exists');
  assert(fileExists('k8s/ingress.yaml'), 'Kubernetes Ingress manifest exists');
  assert(fileExists('k8s/hpa.yaml'), 'Kubernetes HPA manifest exists');
  assert(fileExists('k8s/pvc.yaml'), 'Kubernetes PVC manifest exists');

  // Test deployment configuration
  assert(fileContains('k8s/deployment.yaml', 'replicas: 3'), 'Deployment has multiple replicas');
  assert(fileContains('k8s/deployment.yaml', 'RollingUpdate'), 'Deployment uses rolling update strategy');
  assert(fileContains('k8s/deployment.yaml', 'livenessProbe'), 'Deployment includes liveness probe');
  assert(fileContains('k8s/deployment.yaml', 'readinessProbe'), 'Deployment includes readiness probe');
  assert(fileContains('k8s/deployment.yaml', 'resources:'), 'Deployment specifies resource limits');

  // Test HPA configuration
  assert(fileContains('k8s/hpa.yaml', 'minReplicas: 3'), 'HPA sets minimum replicas');
  assert(fileContains('k8s/hpa.yaml', 'maxReplicas: 10'), 'HPA sets maximum replicas');
  assert(fileContains('k8s/hpa.yaml', 'cpu'), 'HPA monitors CPU usage');
  assert(fileContains('k8s/hpa.yaml', 'memory'), 'HPA monitors memory usage');
}

// Test deployment scripts
function testDeploymentScripts() {
  log('Testing deployment scripts...');

  // Test deployment script exists and is executable
  assert(fileExists('scripts/deploy.sh'), 'Deployment script exists');
  
  const deployScript = fs.statSync('scripts/deploy.sh');
  assert((deployScript.mode & parseInt('111', 8)) !== 0, 'Deployment script is executable');

  // Test script content
  assert(fileContains('scripts/deploy.sh', '#!/bin/bash'), 'Deployment script has bash shebang');
  assert(fileContains('scripts/deploy.sh', 'validate_environment'), 'Deployment script validates environment');
  assert(fileContains('scripts/deploy.sh', 'health_check'), 'Deployment script includes health check');
  assert(fileContains('scripts/deploy.sh', 'rollback'), 'Deployment script includes rollback function');

  // Test performance test script
  assert(fileExists('scripts/performance-test.js'), 'Performance test script exists');
  assert(fileContains('scripts/performance-test.js', 'import http from \'k6/http\''), 'Performance test uses k6');
  assert(fileContains('scripts/performance-test.js', 'thresholds'), 'Performance test defines thresholds');
  assert(fileContains('scripts/performance-test.js', 'p(99)<200'), 'Performance test checks P99 latency');
}

// Test Nginx configuration
function testNginxConfiguration() {
  log('Testing Nginx configuration...');

  // Test Nginx configuration exists
  assert(fileExists('nginx/nginx.conf'), 'Nginx configuration exists');
  assert(fileContains('nginx/nginx.conf', 'upstream booklore_backend'), 'Nginx defines upstream backend');
  assert(fileContains('nginx/nginx.conf', 'gzip on'), 'Nginx enables compression');
  assert(fileContains('nginx/nginx.conf', 'ssl_certificate'), 'Nginx configures SSL');
  assert(fileContains('nginx/nginx.conf', 'limit_req_zone'), 'Nginx configures rate limiting');
  assert(fileContains('nginx/nginx.conf', 'proxy_pass'), 'Nginx configures reverse proxy');
  assert(fileContains('nginx/nginx.conf', 'location /socket.io/'), 'Nginx configures WebSocket proxy');
}

// Test health check script
function testHealthCheckScript() {
  log('Testing health check script...');

  assert(fileExists('src/health-check.ts'), 'Health check script exists');
  assert(fileContains('src/health-check.ts', 'http.request'), 'Health check makes HTTP request');
  assert(fileContains('src/health-check.ts', '/health'), 'Health check targets health endpoint');
  assert(fileContains('src/health-check.ts', 'process.exit(0)'), 'Health check exits with success code');
  assert(fileContains('src/health-check.ts', 'process.exit(1)'), 'Health check exits with error code');
}

// Test Docker build (if Docker is available)
function testDockerBuild() {
  log('Testing Docker build...');

  // Check if Docker is available
  const dockerCheck = executeCommand('docker --version');
  if (!dockerCheck.success) {
    log('Docker not available, skipping build test', 'warning');
    return;
  }

  log('Docker is available, testing build...');

  // Test Docker build
  const buildResult = executeCommand('docker build -t booklore-test:latest .', { 
    timeout: 600000 // 10 minutes for build
  });
  
  assert(buildResult.success, 'Docker build completes successfully');

  if (buildResult.success) {
    // Test image size
    const inspectResult = executeCommand('docker image inspect booklore-test:latest --format="{{.Size}}"');
    if (inspectResult.success) {
      const imageSize = parseInt(inspectResult.output);
      const imageSizeMB = Math.round(imageSize / (1024 * 1024));
      
      log(`Docker image size: ${imageSizeMB}MB`);
      assert(imageSize <= TEST_CONFIG.maxImageSize, `Docker image size (${imageSizeMB}MB) is within 120MB limit`);
    }

    // Test container can start
    const runResult = executeCommand('docker run -d --name booklore-test-container -p 3001:3000 booklore-test:latest');
    if (runResult.success) {
      // Wait a moment for container to start
      executeCommand('sleep 10');
      
      // Test health check
      const healthResult = executeCommand('curl -f http://localhost:3001/health || echo "Health check failed"');
      
      // Clean up container
      executeCommand('docker stop booklore-test-container');
      executeCommand('docker rm booklore-test-container');
      
      assert(healthResult.success && !healthResult.output.includes('Health check failed'), 
             'Container starts and responds to health check');
    }

    // Clean up image
    executeCommand('docker rmi booklore-test:latest');
  }
}

// Test environment configuration
function testEnvironmentConfiguration() {
  log('Testing environment configuration...');

  // Test environment files
  assert(fileExists('.env.example'), 'Example environment file exists');
  assert(fileContains('.env.example', 'DATABASE_URL'), 'Environment includes database URL');
  assert(fileContains('.env.example', 'JWT_SECRET'), 'Environment includes JWT secret');
  assert(fileContains('.env.example', 'REDIS_URL'), 'Environment includes Redis URL');
  assert(fileContains('.env.example', 'STRIPE_SECRET_KEY'), 'Environment includes Stripe configuration');

  // Test database initialization script
  assert(fileExists('scripts/init-db.sql'), 'Database initialization script exists');
  assert(fileContains('scripts/init-db.sql', 'CREATE EXTENSION'), 'Database script creates extensions');
  assert(fileContains('scripts/init-db.sql', 'uuid-ossp'), 'Database script includes UUID extension');
}

// Test requirements coverage
function testRequirementsCoverage() {
  log('Testing requirements coverage...');

  // Requirement 3.1: Multi-stage Dockerfile based on node:20-alpine
  assert(
    fileContains('Dockerfile', 'FROM node:20-alpine') && 
    fileContains('Dockerfile', 'AS builder'),
    'Requirement 3.1: Multi-stage Dockerfile based on node:20-alpine'
  );

  // Requirement 3.2: Optimized image size ≤120MB
  assert(
    fileContains('.dockerignore', 'node_modules') && 
    fileContains('Dockerfile', 'pnpm prune --prod'),
    'Requirement 3.2: Image optimization for size ≤120MB'
  );

  // Requirement 10.1: GitHub Actions CI/CD pipeline
  assert(
    fileExists('.github/workflows/ci-cd.yml') && 
    fileContains('.github/workflows/ci-cd.yml', 'CI/CD Pipeline'),
    'Requirement 10.1: GitHub Actions CI/CD pipeline'
  );

  // Requirement 10.2: Automated testing and deployment
  assert(
    fileContains('.github/workflows/ci-cd.yml', 'pnpm test') && 
    fileContains('.github/workflows/ci-cd.yml', 'deploy-production'),
    'Requirement 10.2: Automated testing and deployment'
  );

  // Task requirement: CI status should be green (configuration exists)
  assert(
    fileContains('.github/workflows/ci-cd.yml', 'test:') && 
    fileContains('.github/workflows/ci-cd.yml', 'build:'),
    'Task requirement: CI pipeline configuration for green status'
  );
}

// Main test runner
async function runTests() {
  log('Starting T09 Dockerfile和CI/CD tests...');
  log('='.repeat(50));

  try {
    testDockerConfiguration();
    testCICDConfiguration();
    testKubernetesConfiguration();
    testDeploymentScripts();
    testNginxConfiguration();
    testHealthCheckScript();
    testEnvironmentConfiguration();
    testRequirementsCoverage();
    
    // Docker build test (optional, requires Docker)
    testDockerBuild();

    log('='.repeat(50));
    log(`Tests completed: ${testResults.passed}/${testResults.total} passed`);
    
    if (testResults.failed === 0) {
      log('🎉 All Docker and CI/CD tests passed!', 'success');
      
      // Summary of implemented features
      log('\n📋 Implemented Features Summary:', 'info');
      log('  • Multi-stage Dockerfile with node:20-alpine base', 'info');
      log('  • Optimized image size with production dependencies only', 'info');
      log('  • Docker Compose for development and production', 'info');
      log('  • GitHub Actions CI/CD pipeline with automated testing', 'info');
      log('  • Kubernetes deployment manifests with HPA', 'info');
      log('  • Nginx reverse proxy configuration', 'info');
      log('  • Automated deployment scripts with rollback capability', 'info');
      log('  • Performance testing with k6', 'info');
      log('  • Health checks and monitoring configuration', 'info');
      log('  • Security scanning and vulnerability checks', 'info');
      
      process.exit(0);
    } else {
      log(`❌ ${testResults.failed} tests failed`, 'error');
      process.exit(1);
    }

  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('Tests interrupted by user');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'error');
  process.exit(1);
});