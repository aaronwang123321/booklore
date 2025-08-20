#!/usr/bin/env node

/**
 * BookLore Node.js 后端完整性验证脚本
 * 全面测试所有API端点和功能模块
 */

const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/v1`;

// 测试配置
const TEST_CONFIG = {
  user: {
    email: 'test@booklore.com',
    password: 'testpassword123'
  },
  performance: {
    maxResponseTime: 500, // ms
    concurrentUsers: 100,
    targetConcurrency: 1500
  },
  timeout: 30000 // 30秒超时
};

let authToken = '';
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: [],
  performance: {},
  coverage: {}
};

// 日志函数
function logTest(category, name, success, details = '', duration = 0) {
  const status = success ? '✅' : '❌';
  const timeStr = duration > 0 ? ` (${duration.toFixed(2)}ms)` : '';
  console.log(`${status} [${category}] ${name}${timeStr}${details ? ': ' + details : ''}`);
  
  testResults.details.push({ 
    category, 
    name, 
    success, 
    details, 
    duration,
    timestamp: new Date().toISOString()
  });
  
  if (success) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

function logSkip(category, name, reason) {
  console.log(`⏭️  [${category}] ${name}: ${reason}`);
  testResults.details.push({ 
    category, 
    name, 
    success: null, 
    details: reason, 
    skipped: true,
    timestamp: new Date().toISOString()
  });
  testResults.skipped++;
}

// HTTP客户端配置
const httpClient = axios.create({
  timeout: TEST_CONFIG.timeout,
  validateStatus: () => true // 不自动抛出错误
});

// 认证函数
async function authenticate() {
  try {
    console.log('\n🔐 开始用户认证...');
    const start = performance.now();
    
    const response = await httpClient.post(`${API_URL}/auth/login`, TEST_CONFIG.user);
    const duration = performance.now() - start;
    
    if (response.status === 200 && response.data.access_token) {
      authToken = response.data.access_token;
      logTest('Auth', '用户登录', true, `Token获取成功`, duration);
      return true;
    } else {
      logTest('Auth', '用户登录', false, `状态码: ${response.status}`, duration);
      return false;
    }
  } catch (error) {
    logTest('Auth', '用户登录', false, error.message);
    return false;
  }
}

// API端点发现
async function discoverApiEndpoints() {
  console.log('\n🔍 发现API端点...');
  
  try {
    // 检查Swagger文档
    const swaggerResponse = await httpClient.get(`${BASE_URL}/api/docs-json`);
    if (swaggerResponse.status === 200) {
      const swagger = swaggerResponse.data;
      const endpoints = [];
      
      for (const [path, methods] of Object.entries(swagger.paths || {})) {
        for (const [method, spec] of Object.entries(methods)) {
          endpoints.push({
            method: method.toUpperCase(),
            path: path,
            summary: spec.summary || '',
            tags: spec.tags || []
          });
        }
      }
      
      logTest('Discovery', 'Swagger端点发现', true, `发现${endpoints.length}个端点`);
      return endpoints;
    }
  } catch (error) {
    logTest('Discovery', 'Swagger端点发现', false, error.message);
  }
  
  // 手动定义核心端点
  const coreEndpoints = [
    // 认证相关
    { method: 'POST', path: '/api/v1/auth/login', tags: ['auth'] },
    { method: 'POST', path: '/api/v1/auth/register', tags: ['auth'] },
    { method: 'POST', path: '/api/v1/auth/refresh', tags: ['auth'] },
    { method: 'POST', path: '/api/v1/auth/logout', tags: ['auth'] },
    
    // 用户管理
    { method: 'GET', path: '/api/v1/users/profile', tags: ['users'] },
    { method: 'PUT', path: '/api/v1/users/profile', tags: ['users'] },
    
    // 图书馆管理
    { method: 'GET', path: '/api/v1/libraries', tags: ['libraries'] },
    { method: 'POST', path: '/api/v1/libraries', tags: ['libraries'] },
    { method: 'GET', path: '/api/v1/libraries/{id}', tags: ['libraries'] },
    { method: 'PUT', path: '/api/v1/libraries/{id}', tags: ['libraries'] },
    { method: 'DELETE', path: '/api/v1/libraries/{id}', tags: ['libraries'] },
    
    // 图书管理
    { method: 'GET', path: '/api/v1/books', tags: ['books'] },
    { method: 'POST', path: '/api/v1/books', tags: ['books'] },
    { method: 'GET', path: '/api/v1/books/{id}', tags: ['books'] },
    { method: 'PUT', path: '/api/v1/books/{id}', tags: ['books'] },
    { method: 'DELETE', path: '/api/v1/books/{id}', tags: ['books'] },
    
    // 文件上传
    { method: 'POST', path: '/api/v1/upload', tags: ['upload'] },
    { method: 'GET', path: '/api/v1/upload/status/{id}', tags: ['upload'] },
    
    // 搜索功能
    { method: 'GET', path: '/api/v1/search', tags: ['search'] },
    { method: 'GET', path: '/api/v1/search/suggestions', tags: ['search'] },
    { method: 'GET', path: '/api/v1/search/facets', tags: ['search'] },
    
    // 订阅管理
    { method: 'GET', path: '/api/v1/subscriptions', tags: ['subscriptions'] },
    { method: 'POST', path: '/api/v1/subscriptions', tags: ['subscriptions'] },
    { method: 'POST', path: '/api/v1/subscriptions/webhook', tags: ['subscriptions'] },
    
    // OPDS协议
    { method: 'GET', path: '/opds', tags: ['opds'] },
    { method: 'GET', path: '/opds/catalog', tags: ['opds'] },
    { method: 'GET', path: '/opds/search', tags: ['opds'] },
    
    // 元数据管理
    { method: 'GET', path: '/api/v1/metadata/{bookId}', tags: ['metadata'] },
    { method: 'POST', path: '/api/v1/metadata/{bookId}/fetch', tags: ['metadata'] },
    { method: 'PUT', path: '/api/v1/metadata/{bookId}', tags: ['metadata'] },
    
    // 文件管理
    { method: 'POST', path: '/api/v1/file-management/move', tags: ['file-management'] },
    { method: 'GET', path: '/api/v1/file-management/transactions', tags: ['file-management'] },
    
    // BookDrop
    { method: 'GET', path: '/api/v1/bookdrop/files', tags: ['bookdrop'] },
    { method: 'POST', path: '/api/v1/bookdrop/import', tags: ['bookdrop'] },
    
    // 邮件分享
    { method: 'POST', path: '/api/v1/email/send-book', tags: ['email'] },
    { method: 'GET', path: '/api/v1/email/recipients', tags: ['email'] },
    
    // 健康检查
    { method: 'GET', path: '/health', tags: ['health'] },
    { method: 'GET', path: '/health/detailed', tags: ['health'] }
  ];
  
  logTest('Discovery', '核心端点定义', true, `定义${coreEndpoints.length}个核心端点`);
  return coreEndpoints;
}

// 测试单个API端点
async function testApiEndpoint(endpoint) {
  const start = performance.now();
  
  try {
    const config = {
      method: endpoint.method,
      url: endpoint.path.replace('{id}', '1').replace('{bookId}', '1'),
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
    };
    
    // 根据不同端点添加测试数据
    if (endpoint.method === 'POST') {
      config.data = getTestDataForEndpoint(endpoint.path);
    }
    
    const response = await httpClient(config);
    const duration = performance.now() - start;
    
    // 判断响应是否合理
    const isSuccess = response.status < 500; // 5xx错误认为是失败
    const statusInfo = `${response.status} ${response.statusText}`;
    
    logTest('API', `${endpoint.method} ${endpoint.path}`, isSuccess, statusInfo, duration);
    
    return {
      endpoint,
      status: response.status,
      duration,
      success: isSuccess
    };
    
  } catch (error) {
    const duration = performance.now() - start;
    logTest('API', `${endpoint.method} ${endpoint.path}`, false, error.message, duration);
    
    return {
      endpoint,
      status: 0,
      duration,
      success: false,
      error: error.message
    };
  }
}

// 获取端点测试数据
function getTestDataForEndpoint(path) {
  const testData = {
    '/api/v1/auth/register': {
      email: 'newuser@test.com',
      password: 'password123',
      name: 'Test User'
    },
    '/api/v1/libraries': {
      name: 'Test Library',
      description: 'A test library'
    },
    '/api/v1/books': {
      title: 'Test Book',
      author: 'Test Author',
      libraryId: 1
    },
    '/api/v1/subscriptions': {
      plan: 'premium'
    },
    '/api/v1/email/send-book': {
      bookId: 1,
      recipients: ['test@example.com'],
      message: 'Test message'
    }
  };
  
  return testData[path] || {};
}

// 性能测试
async function performanceTest() {
  console.log('\n⚡ 开始性能测试...');
  
  const testEndpoint = `${API_URL}/health`;
  const concurrentRequests = TEST_CONFIG.performance.concurrentUsers;
  const results = [];
  
  try {
    const promises = Array(concurrentRequests).fill().map(async () => {
      const start = performance.now();
      const response = await httpClient.get(testEndpoint);
      const duration = performance.now() - start;
      return { status: response.status, duration };
    });
    
    const responses = await Promise.all(promises);
    
    // 计算性能指标
    const durations = responses.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];
    const p99Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)];
    const successRate = responses.filter(r => r.status === 200).length / responses.length;
    
    testResults.performance = {
      concurrentRequests,
      avgDuration,
      p95Duration,
      p99Duration,
      successRate
    };
    
    const performancePass = avgDuration < TEST_CONFIG.performance.maxResponseTime && successRate > 0.95;
    
    logTest('Performance', `${concurrentRequests}并发测试`, performancePass, 
      `平均: ${avgDuration.toFixed(2)}ms, P95: ${p95Duration.toFixed(2)}ms, P99: ${p99Duration.toFixed(2)}ms, 成功率: ${(successRate * 100).toFixed(1)}%`);
    
  } catch (error) {
    logTest('Performance', '性能测试', false, error.message);
  }
}

// 数据库连接测试
async function testDatabaseConnection() {
  console.log('\n🗄️  测试数据库连接...');
  
  try {
    const response = await httpClient.get(`${BASE_URL}/health/detailed`);
    if (response.status === 200 && response.data.database) {
      const dbStatus = response.data.database.status === 'healthy';
      logTest('Database', '数据库连接', dbStatus, 
        `状态: ${response.data.database.status}`);
    } else {
      logTest('Database', '数据库连接', false, '无法获取数据库状态');
    }
  } catch (error) {
    logTest('Database', '数据库连接', false, error.message);
  }
}

// Redis连接测试
async function testRedisConnection() {
  console.log('\n🔴 测试Redis连接...');
  
  try {
    const response = await httpClient.get(`${BASE_URL}/health/detailed`);
    if (response.status === 200 && response.data.redis) {
      const redisStatus = response.data.redis.status === 'healthy';
      logTest('Redis', 'Redis连接', redisStatus, 
        `状态: ${response.data.redis.status}`);
    } else {
      logTest('Redis', 'Redis连接', false, '无法获取Redis状态');
    }
  } catch (error) {
    logTest('Redis', 'Redis连接', false, error.message);
  }
}

// WebSocket连接测试
async function testWebSocketConnection() {
  console.log('\n🔌 测试WebSocket连接...');
  
  // 这里需要实际的WebSocket测试逻辑
  // 暂时跳过，因为需要socket.io客户端
  logSkip('WebSocket', 'WebSocket连接测试', '需要socket.io客户端实现');
}

// 生成测试报告
function generateReport() {
  const total = testResults.passed + testResults.failed + testResults.skipped;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  const report = {
    summary: {
      total,
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      successRate: `${successRate}%`,
      timestamp: new Date().toISOString()
    },
    performance: testResults.performance,
    details: testResults.details,
    recommendations: []
  };
  
  // 生成建议
  if (testResults.failed > 0) {
    report.recommendations.push('修复失败的测试用例');
  }
  
  if (testResults.performance.avgDuration > TEST_CONFIG.performance.maxResponseTime) {
    report.recommendations.push('优化API响应时间');
  }
  
  if (testResults.performance.successRate < 0.95) {
    report.recommendations.push('提高API成功率');
  }
  
  // 保存报告
  const reportPath = path.join(__dirname, '../test-reports/comprehensive-test-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  return report;
}

// 主测试函数
async function runComprehensiveTest() {
  console.log('🚀 开始BookLore Node.js后端完整性验证...\n');
  console.log(`测试目标: ${BASE_URL}`);
  console.log(`超时设置: ${TEST_CONFIG.timeout}ms`);
  console.log('=' * 60);
  
  // 基础连接测试
  await testDatabaseConnection();
  await testRedisConnection();
  
  // 认证测试
  const authSuccess = await authenticate();
  if (!authSuccess) {
    console.log('\n❌ 认证失败，跳过需要认证的测试');
  }
  
  // API端点测试
  const endpoints = await discoverApiEndpoints();
  console.log(`\n📡 开始测试${endpoints.length}个API端点...`);
  
  for (const endpoint of endpoints) {
    await testApiEndpoint(endpoint);
    // 避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 性能测试
  await performanceTest();
  
  // WebSocket测试
  await testWebSocketConnection();
  
  // 生成报告
  const report = generateReport();
  
  // 输出总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  console.log(`✅ 通过: ${report.summary.passed}`);
  console.log(`❌ 失败: ${report.summary.failed}`);
  console.log(`⏭️  跳过: ${report.summary.skipped}`);
  console.log(`📈 成功率: ${report.summary.successRate}`);
  
  if (report.performance.avgDuration) {
    console.log(`⚡ 平均响应时间: ${report.performance.avgDuration.toFixed(2)}ms`);
    console.log(`📊 P99响应时间: ${report.performance.p99Duration.toFixed(2)}ms`);
  }
  
  if (report.recommendations.length > 0) {
    console.log('\n💡 建议:');
    report.recommendations.forEach(rec => console.log(`   - ${rec}`));
  }
  
  console.log(`\n📄 详细报告已保存到: test-reports/comprehensive-test-report.json`);
  
  // 根据结果设置退出码
  const exitCode = report.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 运行测试
runComprehensiveTest().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});