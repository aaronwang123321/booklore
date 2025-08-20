import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../../test/e2e-setup';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('Auth API (e2e)', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'testpassword123',
    name: 'Test User',
  };

  beforeEach(async () => {
    // Clean up users before each test
    await prisma.user.deleteMany();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user).not.toHaveProperty('password');

      // Verify user was created in database
      const createdUser = await prisma.user.findUnique({
        where: { email: testUser.email },
      });
      expect(createdUser).toBeTruthy();
      expect(createdUser.email).toBe(testUser.email);
    });

    it('should fail to register with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to register with weak password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          password: '123',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to register with duplicate email', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      // Second registration with same email
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      await prisma.user.create({
        data: {
          email: testUser.email,
          password: hashedPassword,
          name: testUser.name,
        },
      });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should fail to login with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to login with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to login with missing credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/auth/profile (GET)', () => {
    let authToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and login to get auth token
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      authToken = registerResponse.body.access_token;
      userId = registerResponse.body.user.id;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(userId);
      expect(response.body.email).toBe(testUser.email);
      expect(response.body.name).toBe(testUser.name);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should fail to get profile without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to get profile with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});