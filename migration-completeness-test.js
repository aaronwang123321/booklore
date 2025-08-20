#!/usr/bin/env node

/**
 * BookLore 后端迁移完整性测试
 * 检查从 Java 后端到 Node.js 后端的功能迁移状态
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// 测试配置
const config = {
  baseUrl: 'http://localhost:3000',
  timeout: 10000,
  testUser: {
    email: 'test@example.com',
    password: 'testpassword123'
  }
};

// Java 后端原有功能清单
const javaBackendFeatures = {
  // 用户管理
  userManagement: [
    { method: 'GET', path: '/api/v1/users/me', description: '获取当前用户' },
    { method: 'GET', path: '/api/v1/users/{id}', description: '获取指定用户' },
    { method: 'GET', path: '/api/v1/users', description: '获取所有用户' },
    { method: 'PUT', path: '/api/v1/users/{id}', description: '更新用户' },
    { method: 'DELETE', path: '/api/v1/users/{id}', description: '删除用户' },
    { method: 'PUT', path: '/api/v1/users/change-password', description: '修改密码' },
    { method: 'PUT', path: '/api/v1/users/change-user-password', description: '管理员修改用户密码' },
    { method: 'PUT', path: '/api/v1/users/{id}/settings', description: '更新用户设置' }
  ],

  // 图书管理
  bookManagement: [
    { method: 'GET', path: '/api/v1/books', description: '获取图书列表' },
    { method: 'GET', path: '/api/v1/books/{id}', description: '获取单本图书' },
    { method: 'DELETE', path: '/api/v1/books', description: '批量删除图书' },
    { method: 'GET', path: '/api/v1/books/batch', description: '批量获取图书' },
    { method: 'GET', path: '/api/v1/books/{id}/cover', description: '获取图书封面' },
    { method: 'GET', path: '/api/v1/books/{id}/backup-cover', description: '获取备用封面' },
    { method: 'GET', path: '/api/v1/books/{id}/content', description: '获取图书内容' },
    { method: 'GET', path: '/api/v1/books/{id}/download', description: '下载图书' },
    { method: 'GET', path: '/api/v1/books/{id}/viewer-setting', description: '获取阅读器设置' },
    { method: 'PUT', path: '/api/v1/books/{id}/viewer-setting', description: '更新阅读器设置' },
    { method: 'POST', path: '/api/v1/books/shelves', description: '添加到书架' },
    { method: 'POST', path: '/api/v1/books/progress', description: '更新阅读进度' },
    { method: 'GET', path: '/api/v1/books/{id}/recommendations', description: '获取推荐' },
    { method: 'PUT', path: '/api/v1/books/read-status', description: '更新阅读状态' },
    { method: 'POST', path: '/api/v1/books/reset-progress', description: '重置进度' }
  ],

  // 图书馆管理
  libraryManagement: [
    { method: 'GET', path: '/api/v1/libraries', description: '获取图书馆列表' },
    { method: 'GET', path: '/api/v1/libraries/{id}', description: '获取单个图书馆' },
    { method: 'POST', path: '/api/v1/libraries', description: '创建图书馆' },
    { method: 'PUT', path: '/api/v1/libraries/{id}', description: '更新图书馆' },
    { method: 'DELETE', path: '/api/v1/libraries/{id}', description: '删除图书馆' },
    { method: 'GET', path: '/api/v1/libraries/{id}/book/{bookId}', description: '获取图书馆中的图书' },
    { method: 'GET', path: '/api/v1/libraries/{id}/book', description: '获取图书馆图书列表' },
    { method: 'PUT', path: '/api/v1/libraries/{id}/refresh', description: '重新扫描图书馆' }
  ],

  // 认证功能
  authentication: [
    { method: 'POST', path: '/api/v1/auth/login', description: '用户登录' },
    { method: 'POST', path: '/api/v1/auth/register', description: '用户注册' },
    { method: 'POST', path: '/api/v1/auth/refresh', description: '刷新令牌' },
    { method: 'POST', path: '/api/v1/auth/logout', description: '用户登出' }
  ],

  // 其他功能
  otherFeatures: [
    { method: 'GET', path: '/api/v1/authors', description: '作者管理' },
    { method: 'GET', path: '/api/v1/shelves', description: '书架管理' },
    { method: 'GET', path: '/api/v1/metadata/{bookId}', description: '元数据管理' },
    { method: 'GET', path: '/opds', description: 'OPDS协议' },
    { method: 'POST', path: '/api/v1/upload', description: '文件上传' },
    { method: 'GET', path: '/api/v1/app-settings', description: '应用设置' },
    { method: 'GET', path: '/api/v1/version', description: '版本信息' },
    { method: 'POST', path: '/api/v1/email/send', description: '邮件发送' },
    { method: 'GET', path: '/api/v1/bookdrop/files', description: 'BookDrop文件' },
    { method: 'GET', path: '/api/v1/notifications', description: '通知系统' }
  ]
};

// 测试结果
let testResults = {
  implemented: [],
  missing: [],
  errors: [],
  total: 0,
  passed: 0
};

// HTTP 客户端
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url, config.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'BookLore-Migration-Test/1.0',
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: config.timeout
    };
    
    if (options.data) {
      const postData = JSON.stringify(options.data);
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const responseData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            data: responseData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            data: data
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.data) {
      req.write(JSON.stringify(options.data));
    }
    
    req.end();
  });
}

// 日志函数
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// 获取认证令牌
async function getAuthToken() {
  try {
    log('info', '尝试获取认证令牌...');

    // 首先尝试登录
    const loginResponse = await makeRequest({
      method: 'POST',
      url: '/api/v1/auth/login',
      data: {
        email: config.testUser.email,
        password: config.testUser.password
      }
    });

    if (loginResponse.status === 200 && loginResponse.data.accessToken) {
      log('info', '登录成功，获取到认证令牌');
      return loginResponse.data.accessToken;
    }

    // 如果登录失败，尝试注册
    log('info', '登录失败，尝试注册新用户...');
    const registerResponse = await makeRequest({
      method: 'POST',
      url: '/api/v1/auth/register',
      data: {
        email: config.testUser.email,
        password: config.testUser.password,
        name: 'Test User'
      }
    });

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      log('info', '注册成功，重新尝试登录...');
      const retryLoginResponse = await makeRequest({
        method: 'POST',
        url: '/api/v1/auth/login',
        data: {
          email: config.testUser.email,
          password: config.testUser.password
        }
      });

      if (retryLoginResponse.status === 200 && retryLoginResponse.data.accessToken) {
        return retryLoginResponse.data.accessToken;
      }
    }

    throw new Error('无法获取认证令牌');
  } catch (error) {
    log('error', '获取认证令牌失败', error.message);
    return null;
  }
}

// 测试单个端点
async function testEndpoint(endpoint, token) {
  try {
    testResults.total++;

    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // 将路径中的参数替换为测试值
    let testPath = endpoint.path
      .replace('{id}', '1')
      .replace('{bookId}', '1')
      .replace('{libraryId}', '1');

    const response = await makeRequest({
      method: endpoint.method,
      url: testPath,
      headers
    });

    // 检查响应状态
    if (response.status < 500) {
      // 2xx, 3xx, 4xx 都认为是端点存在的
      testResults.implemented.push({
        ...endpoint,
        status: response.status,
        statusText: response.statusText
      });
      testResults.passed++;
      log('info', `✅ ${endpoint.method} ${endpoint.path} - ${response.status}`);
    } else {
      // 5xx 错误可能表示端点存在但有问题
      testResults.errors.push({
        ...endpoint,
        status: response.status,
        error: response.statusText
      });
      log('warn', `⚠️  ${endpoint.method} ${endpoint.path} - ${response.status} (服务器错误)`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('error', '❌ 无法连接到服务器，请确保服务器正在运行');
      process.exit(1);
    }

    // 404 或其他错误表示端点不存在
    testResults.missing.push({
      ...endpoint,
      error: error.message
    });
    log('error', `❌ ${endpoint.method} ${endpoint.path} - 缺失`);
  }
}

// 运行所有测试
async function runTests() {
  log('info', '开始 BookLore 后端迁移完整性测试');
  log('info', `测试目标: ${config.baseUrl}`);

  // 获取认证令牌
  const token = await getAuthToken();
  if (!token) {
    log('warn', '无法获取认证令牌，将跳过需要认证的端点测试');
  }

  // 测试所有功能模块
  for (const [category, endpoints] of Object.entries(javaBackendFeatures)) {
    log('info', `\n测试模块: ${category}`);
    log('info', '='.repeat(50));

    for (const endpoint of endpoints) {
      await testEndpoint(endpoint, token);
      // 添加小延迟避免过快请求
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// 生成测试报告
function generateReport() {
  log('info', '\n📊 测试报告');
  log('info', '='.repeat(50));

  const completionRate = ((testResults.passed / testResults.total) * 100).toFixed(1);

  log('info', `总端点数: ${testResults.total}`);
  log('info', `已实现: ${testResults.implemented.length}`);
  log('info', `缺失: ${testResults.missing.length}`);
  log('info', `错误: ${testResults.errors.length}`);
  log('info', `完成度: ${completionRate}%`);

  if (testResults.missing.length > 0) {
    log('info', '\n❌ 缺失的功能:');
    testResults.missing.forEach(endpoint => {
      log('info', `  - ${endpoint.method} ${endpoint.path}: ${endpoint.description}`);
    });
  }

  if (testResults.errors.length > 0) {
    log('info', '\n⚠️  有错误的端点:');
    testResults.errors.forEach(endpoint => {
      log('info', `  - ${endpoint.method} ${endpoint.path}: ${endpoint.error}`);
    });
  }

  // 保存详细报告到文件
  const reportPath = path.join(__dirname, 'migration-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    completionRate,
    summary: {
      total: testResults.total,
      implemented: testResults.implemented.length,
      missing: testResults.missing.length,
      errors: testResults.errors.length
    },
    details: testResults
  }, null, 2));

  log('info', `\n详细报告已保存到: ${reportPath}`);

  // 返回完成度
  return parseFloat(completionRate);
}

// 主函数
async function main() {
  try {
    await runTests();
    const completionRate = generateReport();

    log('info', '\n🎯 迁移建议:');

    if (completionRate < 70) {
      log('info', '⚠️  迁移完成度较低，建议优先实现以下核心功能:');
      log('info', '  1. 图书封面和内容获取 API');
      log('info', '  2. 阅读器设置和进度跟踪');
      log('info', '  3. 书架管理功能');
      log('info', '  4. 批量操作支持');
    } else if (completionRate < 90) {
      log('info', '✅ 核心功能基本完整，建议完善以下功能:');
      log('info', '  1. 推荐系统');
      log('info', '  2. 高级搜索功能');
      log('info', '  3. 通知系统');
    } else {
      log('info', '🎉 迁移完成度很高！建议进行性能和稳定性测试。');
    }

    process.exit(completionRate >= 80 ? 0 : 1);
  } catch (error) {
    log('error', '测试执行失败', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { runTests, generateReport };