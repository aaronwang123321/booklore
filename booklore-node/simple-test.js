#!/usr/bin/env node

const http = require('http');

// 简单的服务器测试
function testServer() {
  console.log('🔍 Testing BookLore Server...');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log(`✅ Server responded with status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📊 Response data:', data || 'Empty response');
      
      // 测试其他端点
      testEndpoint('/api/docs', 'API Documentation');
    });
  });

  req.on('error', (error) => {
    console.log('❌ Connection failed:', error.message);
    console.log('💡 Make sure the server is running on port 3000');
  });

  req.on('timeout', () => {
    console.log('⏰ Request timeout');
    req.destroy();
  });

  req.end();
}

function testEndpoint(path, name) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: path,
    method: 'GET',
    timeout: 3000
  };

  const req = http.request(options, (res) => {
    console.log(`📍 ${name} (${path}): ${res.statusCode}`);
  });

  req.on('error', (error) => {
    console.log(`❌ ${name} failed: ${error.message}`);
  });

  req.end();
}

testServer();