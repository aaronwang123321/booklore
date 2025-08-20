import { beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { RedisService } from '../src/shared/redis/redis.service';

let app: INestApplication;
let prisma: PrismaService;
let redis: RedisService;

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://wangke@localhost:5432/book'; // Use existing database
  process.env.JWT_SECRET = 'test-jwt-secret-for-e2e';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.SKIP_REDIS = 'true'; // Skip Redis for testing
  
  // Create testing module
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  
  // Get services
  prisma = app.get<PrismaService>(PrismaService);
  redis = app.get<RedisService>(RedisService);
  
  // Initialize app
  await app.init();
  
  // Clean up test database
  await cleanDatabase();
}, 60000);

afterAll(async () => {
  // Clean up
  if (prisma) {
    await cleanDatabase();
    await prisma.$disconnect();
  }
  
  if (redis) {
    try {
      const client = redis.getClient();
      if (client) {
        await client.flushdb();
      }
    } catch (error) {
      console.warn('Redis cleanup failed:', error.message);
    }
  }
  
  if (app) {
    await app.close();
  }
}, 30000);

async function cleanDatabase() {
  if (!prisma) return;
  
  try {
    // Delete in correct order to avoid foreign key constraints
    await prisma.userBookProgress.deleteMany();
    await prisma.chapter.deleteMany();
    await prisma.book.deleteMany();
    await prisma.libraryMember.deleteMany();
    await prisma.library.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  } catch (error) {
    console.warn('Database cleanup failed:', error.message);
  }
}

// Export for use in tests
export { app, prisma, redis };