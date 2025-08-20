#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing BookLore Node.js setup...');

// Check if package.json exists
if (!fs.existsSync('package.json')) {
  console.error('❌ package.json not found');
  process.exit(1);
}

// Check if main.ts exists
if (!fs.existsSync('src/main.ts')) {
  console.error('❌ src/main.ts not found');
  process.exit(1);
}

// Check if all required modules exist
const requiredModules = [
  'src/app.module.ts',
  'src/shared/shared.module.ts',
  'src/auth/auth.module.ts',
  'src/book/book.module.ts',
  'src/library/library.module.ts',
  'src/subscription/subscription.module.ts',
  'src/upload/upload.module.ts',
  'src/websocket/websocket.module.ts',
];

for (const module of requiredModules) {
  if (!fs.existsSync(module)) {
    console.error(`❌ ${module} not found`);
    process.exit(1);
  }
}

// Check TypeScript configuration
if (!fs.existsSync('tsconfig.json')) {
  console.error('❌ tsconfig.json not found');
  process.exit(1);
}

// Check ESLint configuration
if (!fs.existsSync('.eslintrc.js')) {
  console.error('❌ .eslintrc.js not found');
  process.exit(1);
}

// Check Prettier configuration
if (!fs.existsSync('.prettierrc')) {
  console.error('❌ .prettierrc not found');
  process.exit(1);
}

// Check Vitest configuration
if (!fs.existsSync('vitest.config.ts')) {
  console.error('❌ vitest.config.ts not found');
  process.exit(1);
}

console.log('✅ All required files exist');
console.log('✅ Project structure is correct');
console.log('✅ Configuration files are in place');

// Verify package.json structure
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const requiredScripts = ['build', 'start', 'start:dev', 'test', 'lint', 'dev'];
for (const script of requiredScripts) {
  if (!packageJson.scripts[script]) {
    console.error(`❌ Missing script: ${script}`);
    process.exit(1);
  }
}

console.log('✅ All required npm scripts are defined');

// Check if dependencies are properly defined
const requiredDeps = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  'typescript',
  'vitest',
];

for (const dep of requiredDeps) {
  if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
    console.error(`❌ Missing dependency: ${dep}`);
    process.exit(1);
  }
}

console.log('✅ All required dependencies are defined');
console.log('🎉 T01 setup validation passed!');
console.log('');
console.log('Next steps:');
console.log('1. Run: pnpm install');
console.log('2. Run: pnpm dev');
console.log('3. Verify server starts on http://localhost:3000');