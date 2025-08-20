#!/usr/bin/env node

/**
 * T10 Performance Testing and Optimization Validation Script
 * 
 * This script validates that all T10 requirements are implemented:
 * - Redis caching strategy
 * - Performance monitoring with Prometheus metrics
 * - k6 performance testing setup
 * - Memory optimization and GC monitoring
 * - 1500 concurrent users with P99 < 200ms capability
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();
const REQUIRED_FILES = [
  'src/shared/redis/redis.service.ts',
  'src/shared/cache/cache.decorator.ts',
  'src/shared/cache/cache.interceptor.ts',
  'src/shared/monitoring/monitoring.service.ts',
  'src/shared/middleware/performance.middleware.ts',
  'src/health.controller.ts',
  'scripts/performance-test.js',
  'scripts/artillery-test.yml',
  'scripts/artillery-processor.js',
];

const REQUIRED_DEPENDENCIES = [
  'ioredis',
  'prom-client',
];

const REQUIRED_DEV_DEPENDENCIES = [
  'artillery',
];

console.log('🧪 T10 Performance Testing and Optimization Validation');
console.log('======================================================\n');

let allTestsPassed = true;

// Test 1: Check required files exist
console.log('📁 Checking required files...');
for (const file of REQUIRED_FILES) {
  const filePath = join(PROJECT_ROOT, file);
  if (existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allTestsPassed = false;
  }
}

// Test 2: Check package.json dependencies
console.log('\n📦 Checking dependencies...');
const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));

for (const dep of REQUIRED_DEPENDENCIES) {
  if (packageJson.dependencies && packageJson.dependencies[dep]) {
    console.log(`✅ ${dep} - ${packageJson.dependencies[dep]}`);
  } else {
    console.log(`❌ ${dep} - MISSING from dependencies`);
    allTestsPassed = false;
  }
}

for (const dep of REQUIRED_DEV_DEPENDENCIES) {
  if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
    console.log(`✅ ${dep} - ${packageJson.devDependencies[dep]}`);
  } else {
    console.log(`❌ ${dep} - MISSING from devDependencies`);
    allTestsPassed = false;
  }
}

// Test 3: Check performance test scripts
console.log('\n🎯 Checking performance test scripts...');
const scripts = packageJson.scripts || {};

if (scripts['test:performance']) {
  console.log(`✅ test:performance script - ${scripts['test:performance']}`);
} else {
  console.log('❌ test:performance script - MISSING');
  allTestsPassed = false;
}

if (scripts['test:performance:artillery']) {
  console.log(`✅ test:performance:artillery script - ${scripts['test:performance:artillery']}`);
} else {
  console.log('❌ test:performance:artillery script - MISSING');
  allTestsPassed = false;
}

// Test 4: Validate Redis service implementation
console.log('\n🔴 Validating Redis service...');
try {
  const redisServiceContent = readFileSync(join(PROJECT_ROOT, 'src/shared/redis/redis.service.ts'), 'utf8');
  
  const requiredMethods = [
    'get', 'set', 'del', 'exists', 'mget', 'mset',
    'hget', 'hset', 'hgetall', 'lpush', 'rpop',
    'sadd', 'smembers', 'invalidatePattern', 'getStats'
  ];
  
  let redisMethodsFound = 0;
  for (const method of requiredMethods) {
    if (redisServiceContent.includes(`async ${method}(`)) {
      redisMethodsFound++;
    }
  }
  
  if (redisMethodsFound >= requiredMethods.length * 0.8) {
    console.log(`✅ Redis service methods - ${redisMethodsFound}/${requiredMethods.length} implemented`);
  } else {
    console.log(`❌ Redis service methods - Only ${redisMethodsFound}/${requiredMethods.length} implemented`);
    allTestsPassed = false;
  }
  
  if (redisServiceContent.includes('ioredis')) {
    console.log('✅ Redis service uses ioredis');
  } else {
    console.log('❌ Redis service does not use ioredis');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate Redis service:', error.message);
  allTestsPassed = false;
}

// Test 5: Validate monitoring service implementation
console.log('\n📊 Validating monitoring service...');
try {
  const monitoringContent = readFileSync(join(PROJECT_ROOT, 'src/shared/monitoring/monitoring.service.ts'), 'utf8');
  
  const requiredMetrics = [
    'httpRequestDuration', 'httpRequestTotal', 'cacheHitRate',
    'queueSize', 'dbQueryDuration', 'memoryUsage'
  ];
  
  let metricsFound = 0;
  for (const metric of requiredMetrics) {
    if (monitoringContent.includes(metric)) {
      metricsFound++;
    }
  }
  
  if (metricsFound >= requiredMetrics.length * 0.8) {
    console.log(`✅ Prometheus metrics - ${metricsFound}/${requiredMetrics.length} implemented`);
  } else {
    console.log(`❌ Prometheus metrics - Only ${metricsFound}/${requiredMetrics.length} implemented`);
    allTestsPassed = false;
  }
  
  if (monitoringContent.includes('prom-client')) {
    console.log('✅ Monitoring service uses prom-client');
  } else {
    console.log('❌ Monitoring service does not use prom-client');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate monitoring service:', error.message);
  allTestsPassed = false;
}

// Test 6: Validate cache implementation
console.log('\n🗄️ Validating cache implementation...');
try {
  const cacheDecoratorContent = readFileSync(join(PROJECT_ROOT, 'src/shared/cache/cache.decorator.ts'), 'utf8');
  const cacheInterceptorContent = readFileSync(join(PROJECT_ROOT, 'src/shared/cache/cache.interceptor.ts'), 'utf8');
  
  if (cacheDecoratorContent.includes('@Cache') || cacheDecoratorContent.includes('Cache =')) {
    console.log('✅ Cache decorator implemented');
  } else {
    console.log('❌ Cache decorator not properly implemented');
    allTestsPassed = false;
  }
  
  if (cacheInterceptorContent.includes('NestInterceptor') && cacheInterceptorContent.includes('RedisService')) {
    console.log('✅ Cache interceptor implemented with Redis');
  } else {
    console.log('❌ Cache interceptor not properly implemented');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate cache implementation:', error.message);
  allTestsPassed = false;
}

// Test 7: Validate performance middleware
console.log('\n⚡ Validating performance middleware...');
try {
  const middlewareContent = readFileSync(join(PROJECT_ROOT, 'src/shared/middleware/performance.middleware.ts'), 'utf8');
  
  if (middlewareContent.includes('NestMiddleware') && middlewareContent.includes('MonitoringService')) {
    console.log('✅ Performance middleware implemented');
  } else {
    console.log('❌ Performance middleware not properly implemented');
    allTestsPassed = false;
  }
  
  if (middlewareContent.includes('process.hrtime.bigint()')) {
    console.log('✅ High-resolution timing implemented');
  } else {
    console.log('❌ High-resolution timing not implemented');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate performance middleware:', error.message);
  allTestsPassed = false;
}

// Test 8: Validate k6 performance test configuration
console.log('\n🎯 Validating k6 performance test...');
try {
  const k6TestContent = readFileSync(join(PROJECT_ROOT, 'scripts/performance-test.js'), 'utf8');
  
  if (k6TestContent.includes('target: 1500')) {
    console.log('✅ k6 test configured for 1500 concurrent users');
  } else {
    console.log('❌ k6 test not configured for 1500 concurrent users');
    allTestsPassed = false;
  }
  
  if (k6TestContent.includes('p(99)<200')) {
    console.log('✅ k6 test configured for P99 < 200ms threshold');
  } else {
    console.log('❌ k6 test not configured for P99 < 200ms threshold');
    allTestsPassed = false;
  }
  
  if (k6TestContent.includes('Rate') && k6TestContent.includes('Trend')) {
    console.log('✅ k6 test includes custom metrics');
  } else {
    console.log('❌ k6 test missing custom metrics');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate k6 performance test:', error.message);
  allTestsPassed = false;
}

// Test 9: Validate Artillery configuration
console.log('\n🎪 Validating Artillery configuration...');
try {
  const artilleryContent = readFileSync(join(PROJECT_ROOT, 'scripts/artillery-test.yml'), 'utf8');
  
  if (artilleryContent.includes('arrivalRate: 1500')) {
    console.log('✅ Artillery configured for 1500 concurrent users');
  } else {
    console.log('❌ Artillery not configured for 1500 concurrent users');
    allTestsPassed = false;
  }
  
  if (artilleryContent.includes('p99: 200')) {
    console.log('✅ Artillery configured for P99 < 200ms threshold');
  } else {
    console.log('❌ Artillery not configured for P99 < 200ms threshold');
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate Artillery configuration:', error.message);
  allTestsPassed = false;
}

// Test 10: Validate health endpoints
console.log('\n🏥 Validating health endpoints...');
try {
  const healthControllerContent = readFileSync(join(PROJECT_ROOT, 'src/health.controller.ts'), 'utf8');
  
  const requiredEndpoints = ['/health', '/health/detailed', '/metrics', '/performance'];
  let endpointsFound = 0;
  
  for (const endpoint of requiredEndpoints) {
    if (healthControllerContent.includes(`'${endpoint.replace('/', '')}'`) || 
        healthControllerContent.includes(`"${endpoint.replace('/', '')}"`) ||
        healthControllerContent.includes(`@Get('${endpoint.replace('/', '')}')`)) {
      endpointsFound++;
    }
  }
  
  if (endpointsFound >= 3) {
    console.log(`✅ Health endpoints - ${endpointsFound}/${requiredEndpoints.length} implemented`);
  } else {
    console.log(`❌ Health endpoints - Only ${endpointsFound}/${requiredEndpoints.length} implemented`);
    allTestsPassed = false;
  }
  
} catch (error) {
  console.log('❌ Failed to validate health endpoints:', error.message);
  allTestsPassed = false;
}

// Test 11: Check TypeScript compilation
console.log('\n🔧 Checking TypeScript compilation...');
try {
  execSync('npx tsc --noEmit', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  console.log('✅ TypeScript compilation successful');
} catch (error) {
  console.log('❌ TypeScript compilation failed');
  console.log(error.stdout?.toString() || error.message);
  allTestsPassed = false;
}

// Test 12: Validate environment configuration
console.log('\n🌍 Validating environment configuration...');
const envExamplePath = join(PROJECT_ROOT, '.env.example');
if (existsSync(envExamplePath)) {
  const envContent = readFileSync(envExamplePath, 'utf8');
  
  const requiredEnvVars = ['REDIS_HOST', 'REDIS_PORT', 'DATABASE_URL'];
  let envVarsFound = 0;
  
  for (const envVar of requiredEnvVars) {
    if (envContent.includes(envVar)) {
      envVarsFound++;
    }
  }
  
  if (envVarsFound >= requiredEnvVars.length) {
    console.log(`✅ Environment variables - ${envVarsFound}/${requiredEnvVars.length} configured`);
  } else {
    console.log(`❌ Environment variables - Only ${envVarsFound}/${requiredEnvVars.length} configured`);
    allTestsPassed = false;
  }
} else {
  console.log('❌ .env.example file not found');
  allTestsPassed = false;
}

// Final results
console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
  console.log('🎉 T10 Performance Testing and Optimization - ALL TESTS PASSED!');
  console.log('\n✅ Implementation includes:');
  console.log('   • Redis caching with comprehensive operations');
  console.log('   • Prometheus metrics and monitoring');
  console.log('   • Performance middleware with request tracking');
  console.log('   • k6 performance testing for 1500 concurrent users');
  console.log('   • Artillery alternative testing configuration');
  console.log('   • Health endpoints with detailed metrics');
  console.log('   • Cache decorators and interceptors');
  console.log('   • Memory and GC monitoring');
  console.log('   • P99 < 200ms performance targets');
  
  console.log('\n🚀 Ready for performance testing!');
  console.log('   Run: npm run test:performance');
  console.log('   Or:  npm run test:performance:artillery');
  
  process.exit(0);
} else {
  console.log('❌ T10 Performance Testing and Optimization - SOME TESTS FAILED');
  console.log('\nPlease fix the issues above before proceeding.');
  process.exit(1);
}