import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { PrismaService } from '../shared/database/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { MonitoringService } from '../shared/monitoring/monitoring.service';
import { LibraryRole } from '@prisma/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('LibraryService', () => {
  let service: LibraryService;
  let prismaService: PrismaService;

  const mockLibrary = {
    id: 1,
    name: 'Test Library',
    description: 'Test Description',
    isPublic: false,
    settings: {},
    ownerId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
    },
    _count: {
      books: 0,
      shelves: 0,
      members: 0,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        {
          provide: PrismaService,
          useValue: {
            library: {
              create: vi.fn(),
              findMany: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
              delete: vi.fn(),
            },
            book: {
              findMany: vi.fn(),
            },
            shelf: {
              findMany: vi.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
          },
        },
        {
          provide: MonitoringService,
          useValue: {
            recordDatabaseQuery: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new library', async () => {
      const createLibraryDto = {
        name: 'Test Library',
        description: 'Test Description',
        isPublic: false,
      };

      vi.mocked(prismaService.library.create).mockResolvedValue(mockLibrary);

      const result = await service.create(1, createLibraryDto);

      expect(result).toEqual(mockLibrary);
      expect(prismaService.library.create).toHaveBeenCalledWith({
        data: {
          ...createLibraryDto,
          ownerId: 1,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              books: true,
              shelves: true,
              members: true,
            },
          },
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return all accessible libraries', async () => {
      vi.mocked(prismaService.library.findMany).mockResolvedValue([mockLibrary]);

      const result = await service.findAll(1);

      expect(result).toEqual([mockLibrary]);
      expect(prismaService.library.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: 1 },
            { isPublic: true },
            {
              members: {
                some: {
                  userId: 1,
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              books: true,
              shelves: true,
              members: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a library if user has access', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue(mockLibrary);
      vi.spyOn(service, 'checkAccess').mockResolvedValue(true);

      const result = await service.findOne(1, 1);

      expect(result).toEqual(mockLibrary);
    });

    it('should throw NotFoundException if library does not exist', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue(null);

      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no access', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue(mockLibrary);
      vi.spyOn(service, 'checkAccess').mockResolvedValue(false);

      await expect(service.findOne(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkAccess', () => {
    it('should return true for library owner', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue({
        ...mockLibrary,

      });

      const result = await service.checkAccess(1, 1);

      expect(result).toBe(true);
    });

    it('should return true for public library', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue({
        ...mockLibrary,
        ownerId: 2,
        isPublic: true,

      });

      const result = await service.checkAccess(1, 1);

      expect(result).toBe(true);
    });

    it('should return true for library member', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue({
        ...mockLibrary,
        ownerId: 2,
        isPublic: false,
      });

      const result = await service.checkAccess(1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-accessible library', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue({
        ...mockLibrary,
        ownerId: 2,
        isPublic: false,
      });

      const result = await service.checkAccess(1, 1);

      expect(result).toBe(false);
    });

    it('should return false if library does not exist', async () => {
      vi.mocked(prismaService.library.findUnique).mockResolvedValue(null);

      const result = await service.checkAccess(1, 1);

      expect(result).toBe(false);
    });
  });
});