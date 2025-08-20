import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Global test setup
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/booklore_test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  
  // Mock browser globals for libraries that expect them
  global.window = {
    document: {},
    navigator: {},
    location: {},
  } as any;
  
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.location = global.window.location;
  
  // Mock XMLHttpRequest for epubjs
  global.XMLHttpRequest = class {
    open() {}
    send() {}
    setRequestHeader() {}
  } as any;
});

afterAll(async () => {
  // Global test cleanup
});