#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';

async function main() {
  console.log('🗄️  Testing database setup...');

// Check if schema.prisma exists
if (!fs.existsSync('prisma/schema.prisma')) {
  console.error('❌ prisma/schema.prisma not found');
  process.exit(1);
}

console.log('✅ Prisma schema file exists');

// Check if seed.ts exists
if (!fs.existsSync('prisma/seed.ts')) {
  console.error('❌ prisma/seed.ts not found');
  process.exit(1);
}

console.log('✅ Seed file exists');

// Validate schema syntax
try {
  execSync('pnpm prisma validate', { stdio: 'pipe' });
  console.log('✅ Prisma schema is valid');
} catch (error) {
  console.error('❌ Prisma schema validation failed:', error.message);
  process.exit(1);
}

// Check if Prisma client is generated
try {
  execSync('pnpm prisma generate', { stdio: 'pipe' });
  console.log('✅ Prisma client generated successfully');
} catch (error) {
  console.error('❌ Prisma client generation failed:', error.message);
  process.exit(1);
}

// Check if we can import PrismaClient
try {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  console.log('✅ PrismaClient can be imported');
  
  // Test basic functionality
  if (typeof prisma.user === 'object') {
    console.log('✅ User model is available');
  }
  
  if (typeof prisma.library === 'object') {
    console.log('✅ Library model is available');
  }
  
  if (typeof prisma.book === 'object') {
    console.log('✅ Book model is available');
  }
  
  if (typeof prisma.subscription === 'object') {
    console.log('✅ Subscription model is available');
  }
  
  await prisma.$disconnect();
  
} catch (error) {
  console.error('❌ PrismaClient import failed:', error.message);
  process.exit(1);
}

  console.log('🎉 T02 database setup validation passed!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Setup PostgreSQL database');
  console.log('2. Run: pnpm prisma:migrate');
  console.log('3. Run: pnpm prisma:seed');
  console.log('4. Verify: prisma migrate dev --name init');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});