const { spawn } = require('child_process');
const axios = require('axios');

async function testServerStart() {
  console.log('Starting server...');
  
  const server = spawn('pnpm', ['start:dev'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  let serverReady = false;
  
  server.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Server output:', output);
    if (output.includes('Application is running on')) {
      serverReady = true;
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });

  // Wait for server to start
  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!serverReady) {
    console.error('Server failed to start');
    server.kill();
    process.exit(1);
  }

  console.log('Server started successfully');
  
  // Test health endpoint
  try {
    const response = await axios.get('http://localhost:3000/health');
    console.log('Health check passed:', response.status);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }

  server.kill();
  console.log('Server stopped');
}

testServerStart().catch(console.error);