import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookService } from './book.service';
import { PrismaService } from '../shared/database/prisma.service';
import { LibraryService } from '../library/library.service';
import { BookStatus } from '@prisma/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BookService', () => {
  let service: BookService;
  let prismaService: PrismaService;
  let libraryService: LibraryService;

  const mockBook = {
    id: 1,
    title: 'Test Book',
    author: 'Test Author',
    isbn: '1234567890',
    language: 'en',
    publisher: 'Test Publisher',
    publishDate: new Date(),
    description: 'Test Description',
    filePath: '/path/to/file.epub',
    fileName: 'file.epub',
    fileSize: 1024,
    fileType: 'epub',
    mimeType: 'application/epub+zip',
    coverImage: null,
    metadata: {},
    status: BookStatus.COMPLETED,
    error: null,
    processedAt: new Date(),
    libraryId: 1,
    shelfId: null,
    genres: [],
    rating: null,
    pageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    library: {
      id: 1,
      name: 'Test Library',
    },
    shelf: null,
    chapters: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: {
            book: {
              create: vi.fn(),
              findMany: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
              delete: vi.fn(),
            },
            library: {
              findMany: vi.fn(),
            },
            shelf: {
              findUnique: vi.fn(),
            },
          },
        },
        {
          provide: LibraryService,
          useValue: {
            checkAccess: vi.fn(),
            checkAdminAccess: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookService>(BookService);
    prismaService = module.get<PrismaService>(PrismaService);
    libraryService = module.get<LibraryService>(LibraryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new book with file', async () => {
      const createBookDto = {
        title: 'Test Book',
        author: 'Test Author',
        libraryId: 1,
      };

      const mockFile = {
        originalname: 'test.epub',
        filename: 'test.epub',
        path: '/path/to/test.epub',
        size: 1024,
        mimetype: 'application/epub+zip',
      } as Express.Multer.File;

      vi.mocked(libraryService.checkAccess).mockResolvedValue(true);
      vi.mocked(prismaService.book.create).mockResolvedValue(mockBook);

      const result = await service.create(1, createBookDto, mockFile);

      expect(result).toEqual(mockBook);
      expect(libraryService.checkAccess).toHaveBeenCalledWith(1, 1);
      expect(prismaService.book.create).toHaveBeenCalledWith({
        data: {
          ...createBookDto,
          filePath: '/path/to/test.epub',
          fileName: 'test.epub',
          fileSize: 1024,
          fileType: 'epub',
          mimeType: 'application/epub+zip',
          status: BookStatus.PROCESSING,
        },
        include: expect.any(Object),
      });
    });

    it('should create a new book without file', async () => {
      const createBookDto = {
        title: 'Test Book',
        author: 'Test Author',
        libraryId: 1,
      };

      vi.mocked(libraryService.checkAccess).mockResolvedValue(true);
      vi.mocked(prismaService.book.create).mockResolvedValue(mockBook);

      const result = await service.create(1, createBookDto);

      expect(result).toEqual(mockBook);
      expect(prismaService.book.create).toHaveBeenCalledWith({
        data: {
          ...createBookDto,
          filePath: '',
          fileName: '',
          fileSize: 0,
          fileType: '',
          mimeType: '',
          status: BookStatus.COMPLETED,
        },
        include: expect.any(Object),
      });
    });

    it('should throw ForbiddenException if user has no access to library', async () => {
      const createBookDto = {
        title: 'Test Book',
        libraryId: 1,
      };

      vi.mocked(libraryService.checkAccess).mockResolvedValue(false);

      await expect(service.create(1, createBookDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return a book if user has access', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAccess).mockResolvedValue(true);

      const result = await service.findOne(1, 1);

      expect(result).toEqual(mockBook);
    });

    it('should throw NotFoundException if book does not exist', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(null);

      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no access', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAccess).mockResolvedValue(false);

      await expect(service.findOne(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update a book if user has access', async () => {
      const updateBookDto = {
        title: 'Updated Title',
      };

      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAccess).mockResolvedValue(true);
      vi.mocked(prismaService.book.update).mockResolvedValue({
        ...mockBook,
        title: 'Updated Title',
      });

      const result = await service.update(1, 1, updateBookDto);

      expect(result.title).toBe('Updated Title');
      expect(prismaService.book.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateBookDto,
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(null);

      await expect(service.update(1, 1, {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no access', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAccess).mockResolvedValue(false);

      await expect(service.update(1, 1, {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a book if user has admin access', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAdminAccess).mockResolvedValue(true);
      vi.mocked(prismaService.book.delete).mockResolvedValue(mockBook);

      await service.remove(1, 1);

      expect(prismaService.book.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(null);

      await expect(service.remove(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no admin access', async () => {
      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook);
      vi.mocked(libraryService.checkAdminAccess).mockResolvedValue(false);

      await expect(service.remove(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });
});