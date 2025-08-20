import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../../test/e2e-setup';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as fs from 'fs';

describe('Book API (e2e)', () => {
  let authToken: string;
  let userId: number;
  let libraryId: number;
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
    // Clean up data
    await prisma.userBookProgress.deleteMany();
    await prisma.chapter.deleteMany();
    await prisma.book.deleteMany();
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

    // Create a test library
    const library = await prisma.library.create({
      data: {
        name: 'Test Library',
        description: 'A test library',
        isPublic: false,
        ownerId: userId,
      },
    });
    libraryId = library.id;
  });

  describe('/books (POST)', () => {
    it('should create a new book successfully', async () => {
      const bookData = {
        title: 'Test Book',
        author: 'Test Author',
        isbn: '978-0123456789',
        description: 'A test book for e2e testing',
        libraryId: libraryId,
      };

      const response = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookData)
        .expect(HttpStatus.CREATED);

      expect(response.body.title).toBe(bookData.title);
      expect(response.body.author).toBe(bookData.author);
      expect(response.body.isbn).toBe(bookData.isbn);
      expect(response.body.description).toBe(bookData.description);
      expect(response.body.libraryId).toBe(bookData.libraryId);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');

      // Verify book was created in database
      const createdBook = await prisma.book.findUnique({
        where: { id: response.body.id },
      });
      expect(createdBook).toBeTruthy();
      expect(createdBook.title).toBe(bookData.title);
    });

    it('should fail to create book without authentication', async () => {
      const bookData = {
        title: 'Unauthorized Book',
        author: 'Test Author',
        libraryId: libraryId,
      };

      await request(app.getHttpServer())
        .post('/books')
        .send(bookData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create book with invalid library', async () => {
      const bookData = {
        title: 'Test Book',
        author: 'Test Author',
        libraryId: 'non-existent-library-id',
      };

      await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create book in library without access', async () => {
      const bookData = {
        title: 'Unauthorized Book',
        author: 'Test Author',
        libraryId: libraryId,
      };

      await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send(bookData)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('/books (GET)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Test Book',
          author: 'Test Author',
          isbn: '978-0123456789',
          description: 'A test book',
          libraryId: libraryId,
          filePath: '/test/path/test.epub',
          fileName: 'test.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;
    });

    it('should get all books for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      
      const book = response.body.find(b => b.id === bookId);
      expect(book).toBeTruthy();
      expect(book.title).toBe('Test Book');
    });

    it('should filter books by library', async () => {
      const response = await request(app.getHttpServer())
        .get(`/books?libraryId=${libraryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(book => {
        expect(book.libraryId).toBe(libraryId);
      });
    });

    it('should fail to get books without authentication', async () => {
      await request(app.getHttpServer())
        .get('/books')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/books/:id (GET)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Test Book',
          author: 'Test Author',
          isbn: '978-0123456789',
          description: 'A test book',
          libraryId: libraryId,
          filePath: '/test/path/test2.epub',
          fileName: 'test2.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;
    });

    it('should get book details for authorized user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(bookId);
      expect(response.body.title).toBe('Test Book');
      expect(response.body.author).toBe('Test Author');
      expect(response.body.libraryId).toBe(libraryId);
    });

    it('should fail to get book for unauthorized user', async () => {
      await request(app.getHttpServer())
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail to get non-existent book', async () => {
      await request(app.getHttpServer())
        .get('/books/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('/books/:id (PUT)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Original Book',
          author: 'Original Author',
          isbn: '978-0123456789',
          description: 'Original description',
          libraryId: libraryId,
          filePath: '/test/path/original.epub',
          fileName: 'original.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;
    });

    it('should update book successfully for authorized user', async () => {
      const updateData = {
        title: 'Updated Book',
        author: 'Updated Author',
        description: 'Updated description',
      };

      const response = await request(app.getHttpServer())
        .put(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.author).toBe(updateData.author);
      expect(response.body.description).toBe(updateData.description);

      // Verify update in database
      const updatedBook = await prisma.book.findUnique({
        where: { id: bookId },
      });
      expect(updatedBook.title).toBe(updateData.title);
    });

    it('should fail to update book for unauthorized user', async () => {
      await request(app.getHttpServer())
        .put(`/books/${bookId}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send({ title: 'Unauthorized Update' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('/books/:id (DELETE)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Book to Delete',
          author: 'Test Author',
          isbn: '978-0123456789',
          description: 'This book will be deleted',
          libraryId: libraryId,
          filePath: '/test/path/delete.epub',
          fileName: 'delete.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;
    });

    it('should delete book successfully for authorized user', async () => {
      await request(app.getHttpServer())
        .delete(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      // Verify deletion in database
      const deletedBook = await prisma.book.findUnique({
        where: { id: bookId },
      });
      expect(deletedBook).toBeNull();
    });

    it('should fail to delete book for unauthorized user', async () => {
      await request(app.getHttpServer())
        .delete(`/books/${bookId}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // Verify book still exists
      const book = await prisma.book.findUnique({
        where: { id: bookId },
      });
      expect(book).toBeTruthy();
    });
  });

  describe('/books/:id/progress (GET)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Progress Test Book',
          author: 'Test Author',
          libraryId: libraryId,
          filePath: '/test/path/book.epub',
          fileName: 'book.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;

      // Create some progress data
      await prisma.userBookProgress.create({
        data: {
          userId: userId,
          bookId: bookId,
          progress: 25.0,
          currentPage: 50,
        },
      });
    });

    it('should get book progress for user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.currentPage).toBe(50);
      expect(response.body.progress).toBe(25.0);
      expect(response.body.userId).toBe(userId);
      expect(response.body.bookId).toBe(bookId);
    });

    it('should return empty progress for user with no progress', async () => {
      const response = await request(app.getHttpServer())
        .get(`/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({});
    });
  });

  describe('/books/:id/progress (PUT)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await prisma.book.create({
        data: {
          title: 'Progress Update Book',
          author: 'Test Author',
          libraryId: libraryId,
          filePath: '/test/path/book2.epub',
          fileName: 'book2.epub',
          fileSize: 2048,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
        },
      });
      bookId = book.id;
    });

    it('should update book progress successfully', async () => {
      const progressData = {
        currentPage: 75,
        progress: 37.5,
      };

      const response = await request(app.getHttpServer())
        .put(`/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(progressData)
        .expect(HttpStatus.OK);

      expect(response.body.currentPage).toBe(progressData.currentPage);
      expect(response.body.progress).toBe(progressData.progress);

      // Verify update in database
      const progress = await prisma.userBookProgress.findUnique({
        where: {
          userId_bookId: {
            userId: userId,
            bookId: bookId,
          },
        },
      });
      expect(progress.currentPage).toBe(progressData.currentPage);
    });

    it('should create new progress if none exists', async () => {
      const progressData = {
        currentPage: 25,
        progress: 16.7,
      };

      await request(app.getHttpServer())
        .put(`/books/${bookId}/progress`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(progressData)
        .expect(HttpStatus.OK);

      // Verify creation in database
      const progress = await prisma.userBookProgress.findUnique({
        where: {
          userId_bookId: {
            userId: userId,
            bookId: bookId,
          },
        },
      });
      expect(progress).toBeTruthy();
      expect(progress.currentPage).toBe(progressData.currentPage);
    });
  });
});