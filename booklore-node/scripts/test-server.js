#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');

console.log('🚀 Testing server startup...');

// Start the server
const server = spawn('pnpm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: process.cwd(),
});

let serverOutput = '';

server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  console.log(output.trim());
  
  // Check if server is ready
  if (output.includes('BookLore API is running on')) {
    console.log('✅ Server started successfully!');
    
    // Test health endpoint
    setTimeout(() => {
      testHealthEndpoint();
    }, 1000);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});

function testHealthEndpoint() {
  console.log('🔍 Testing health endpoint...');
  
  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET',
  }, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Health endpoint responded successfully');
        console.log('Response:', data);
        console.log('🎉 T01 validation completed successfully!');
      } else {
        console.log('❌ Health endpoint failed with status:', res.statusCode);
      }
      
      // Kill the server
      server.kill('SIGTERM');
      process.exit(0);
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Health endpoint test failed:', error.message);
    server.kill('SIGTERM');
    process.exit(1);
  });
  
  req.end();
}

// Kill server after 10 seconds if it doesn't start
setTimeout(() => {
  console.log('⏰ Server startup timeout');
  server.kill('SIGTERM');
  process.exit(1);
}, 10000);