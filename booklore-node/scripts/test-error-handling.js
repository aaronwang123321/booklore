#!/usr/bin/env node

/**
 * 错误处理机制验证脚本
 * 测试统一错误处理系统的各种场景
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// 测试用例配置
const testCases = [
  {
    name: '404 Not Found Error',
    method: 'GET',
    url: '/api/non-existent-endpoint',
    expectedStatus: 404,
    expectedFields: ['statusCode', 'timestamp', 'path', 'method', 'message']
  },
  {
    name: '401 Unauthorized Error',
    method: 'GET',
    url: '/api/v1/auth/profile',
    expectedStatus: 401,
    expectedFields: ['statusCode', 'timestamp', 'path', 'method', 'message']
  },
  {
    name: '400 Bad Request Error',
    method: 'POST',
    url: '/api/v1/auth/login',
    data: { invalid: 'data' },
    expectedStatus: 400,
    expectedFields: ['statusCode', 'timestamp', 'path', 'method', 'message']
  },
  {
    name: '200 Health Check Success',
    method: 'GET',
    url: '/health',
    expectedStatus: 200,
    expectedFields: ['status']
  }
];

/**
 * 验证错误响应格式
 */
function validateErrorResponse(response, testCase) {
  const { data } = response;
  const errors = [];

  // 检查必需字段
  testCase.expectedFields.forEach(field => {
    if (!(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // 检查字段类型
  if (typeof data.statusCode !== 'number') {
    errors.push('statusCode should be a number');
  }

  if (typeof data.timestamp !== 'string') {
    errors.push('timestamp should be a string');
  }

  if (typeof data.path !== 'string') {
    errors.push('path should be a string');
  }

  if (typeof data.method !== 'string') {
    errors.push('method should be a string');
  }

  // 检查时间戳格式
  if (data.timestamp && !isValidISO8601(data.timestamp)) {
    errors.push('timestamp should be in ISO8601 format');
  }

  return errors;
}

/**
 * 验证ISO8601时间格式
 */
function isValidISO8601(dateString) {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  return iso8601Regex.test(dateString) && !isNaN(Date.parse(dateString));
}

/**
 * 执行单个测试用例
 */
async function runTestCase(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);

  try {
    const config = {
      method: testCase.method,
      url: `${BASE_URL}${testCase.url}`,
      validateStatus: () => true, // 不抛出错误，让我们手动检查状态码
    };

    if (testCase.data) {
      config.data = testCase.data;
    }

    const response = await axios(config);
    const { status, data } = response;

    console.log(`   Status: ${status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    // 检查状态码
    const expectedStatuses = Array.isArray(testCase.expectedStatus)
      ? testCase.expectedStatus
      : [testCase.expectedStatus];

    if (!expectedStatuses.includes(status)) {
      console.log(`   ❌ FAIL: Expected status ${testCase.expectedStatus}, got ${status}`);
      return false;
    }

    // 如果是错误响应，验证格式
    if (status >= 400) {
      const validationErrors = validateErrorResponse(response, testCase);
      if (validationErrors.length > 0) {
        console.log(`   ❌ FAIL: Response format errors:`);
        validationErrors.forEach(error => console.log(`      - ${error}`));
        return false;
      }
    }

    console.log(`   ✅ PASS`);
    return true;

  } catch (error) {
    console.log(`   ❌ FAIL: Request failed - ${error.message}`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🔍 BookLore API 错误处理机制验证');
  console.log('=' .repeat(50));

  // 检查服务器是否运行
  try {
    await axios.get(`${BASE_URL}/health`);
    console.log('✅ 服务器运行正常');
  } catch (error) {
    console.log('❌ 服务器未运行，请先启动应用程序');
    console.log('   运行命令: npm run start:dev');
    process.exit(1);
  }

  let passedTests = 0;
  let totalTests = testCases.length;

  // 运行所有测试用例
  for (const testCase of testCases) {
    const passed = await runTestCase(testCase);
    if (passed) {
      passedTests++;
    }
  }

  // 输出结果
  console.log('\n' + '=' .repeat(50));
  console.log(`📊 测试结果: ${passedTests}/${totalTests} 通过`);

  if (passedTests === totalTests) {
    console.log('🎉 所有错误处理测试通过！统一错误处理机制工作正常。');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败，请检查错误处理实现。');
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { main, runTestCase, validateErrorResponse };