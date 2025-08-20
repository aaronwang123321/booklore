import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../../test/e2e-setup';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('Library API (e2e)', () => {
  let authToken: string;
  let userId: number;
  let otherUserId: number;
  let otherAuthToken: string;

  const testUser = {
    email: 'test@example.com',
    password: 'testpassword123',
    name: 'Test User',
  };

  const otherUser = {
    email: 'other@example.com',
    password: 'otherpassword123',
    name: 'Other User',
  };

  beforeEach(async () => {
    // Clean up data in correct order
    await prisma.libraryMember.deleteMany();
    await prisma.library.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();

    // Create test users
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const otherHashedPassword = await bcrypt.hash(otherUser.password, 10);
    
    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        password: hashedPassword,
        name: testUser.name,
      },
    });
    
    const otherUserRecord = await prisma.user.create({
      data: {
        email: otherUser.email,
        password: otherHashedPassword,
        name: otherUser.name,
      },
    });

    userId = user.id;
    otherUserId = otherUserRecord.id;

    // Get auth tokens
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });
    authToken = loginResponse.body.access_token;

    const otherLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: otherUser.email,
        password: otherUser.password,
      });
    otherAuthToken = otherLoginResponse.body.access_token;
  });

  describe('/libraries (POST)', () => {
    it('should create a new library successfully', async () => {
      const libraryData = {
        name: 'My Test Library',
        description: 'A test library for e2e testing',
        isPublic: false,
      };

      const response = await request(app.getHttpServer())
        .post('/libraries')
        .set('Authorization', `Bearer ${authToken}`)
        .send(libraryData)
        .expect(HttpStatus.CREATED);

      expect(response.body.name).toBe(libraryData.name);
      expect(response.body.description).toBe(libraryData.description);
      expect(response.body.isPublic).toBe(libraryData.isPublic);
      expect(response.body.ownerId).toBe(userId);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');

      // Verify library was created in database
      const createdLibrary = await prisma.library.findUnique({
        where: { id: response.body.id },
      });
      expect(createdLibrary).toBeTruthy();
      expect(createdLibrary.name).toBe(libraryData.name);
    });

    it('should fail to create library without authentication', async () => {
      const libraryData = {
        name: 'Unauthorized Library',
        description: 'This should fail',
        isPublic: false,
      };

      await request(app.getHttpServer())
        .post('/libraries')
        .send(libraryData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create library with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/libraries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required name field
          description: 'Invalid library',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('/libraries (GET)', () => {
    it('should get all accessible libraries for authenticated user', async () => {
      // Create test libraries
      const publicLibrary = await prisma.library.create({
        data: {
          name: 'Public Library',
          description: 'A public library',
          isPublic: true,
          ownerId: userId,
        },
      });

      const privateLibrary = await prisma.library.create({
        data: {
          name: 'Private Library',
          description: 'A private library',
          isPublic: false,
          ownerId: userId,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/libraries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      
      const libraryIds = response.body.map(lib => lib.id);
      expect(libraryIds).toContain(publicLibrary.id);
      expect(libraryIds).toContain(privateLibrary.id);
    });

    it('should only get public libraries for other users', async () => {
      // Create test libraries
      const publicLibrary = await prisma.library.create({
        data: {
          name: 'Public Library',
          description: 'A public library',
          isPublic: true,
          ownerId: userId,
        },
      });

      const privateLibrary = await prisma.library.create({
        data: {
          name: 'Private Library',
          description: 'A private library',
          isPublic: false,
          ownerId: userId,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/libraries')
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      
      const libraryIds = response.body.map(lib => lib.id);
      expect(libraryIds).toContain(publicLibrary.id);
      expect(libraryIds).not.toContain(privateLibrary.id);
    });

    it('should fail to get libraries without authentication', async () => {
      await request(app.getHttpServer())
        .get('/libraries')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/libraries/:id (GET)', () => {
    it('should get library details for owner', async () => {
      const library = await prisma.library.create({
        data: {
          name: 'Test Library',
          description: 'A test library',
          isPublic: false,
          ownerId: userId,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(library.id);
      expect(response.body.name).toBe('Test Library');
      expect(response.body.ownerId).toBe(userId);
    });

    it('should fail to get private library for non-owner', async () => {
      const library = await prisma.library.create({
        data: {
          name: 'Test Library',
          description: 'A test library',
          isPublic: false,
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .get(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail to get non-existent library', async () => {
      await request(app.getHttpServer())
        .get('/libraries/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('/libraries/:id (PUT)', () => {
    it('should update library successfully for owner', async () => {
      const library = await prisma.library.create({
        data: {
          name: 'Original Library',
          description: 'Original description',
          isPublic: false,
          ownerId: userId,
        },
      });

      const updateData = {
        name: 'Updated Library',
        description: 'Updated description',
        isPublic: true,
      };

      const response = await request(app.getHttpServer())
        .put(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.name).toBe(updateData.name);
      expect(response.body.description).toBe(updateData.description);
      expect(response.body.isPublic).toBe(updateData.isPublic);

      // Verify update in database
      const updatedLibrary = await prisma.library.findUnique({
        where: { id: library.id },
      });
      expect(updatedLibrary.name).toBe(updateData.name);
    });

    it('should fail to update library for non-owner', async () => {
      const library = await prisma.library.create({
        data: {
          name: 'Original Library',
          description: 'Original description',
          isPublic: false,
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .put(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send({ name: 'Unauthorized Update' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('/libraries/:id (DELETE)', () => {
    it('should delete library successfully for owner', async () => {
      const library = await prisma.library.create({
        data: {
          name: 'Library to Delete',
          description: 'This library will be deleted',
          isPublic: false,
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .delete(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      // Verify deletion in database
      const deletedLibrary = await prisma.library.findUnique({
        where: { id: library.id },
      });
      expect(deletedLibrary).toBeNull();
    });

    it('should fail to delete library for non-owner', async () => {
      // Verify userId is valid
      expect(userId).toBeDefined();
      expect(typeof userId).toBe('number');
      
      const library = await prisma.library.create({
        data: {
          name: 'Library to Delete',
          description: 'This library will be deleted',
          isPublic: false,
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .delete(`/libraries/${library.id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // Verify library still exists
      const libraryStillExists = await prisma.library.findUnique({
        where: { id: library.id },
      });
      expect(libraryStillExists).toBeTruthy();
    });
  });
});