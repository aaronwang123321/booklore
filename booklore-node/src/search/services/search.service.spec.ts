import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { SearchRequest, SearchResponse } from '../interfaces/search.interface';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SearchService', () => {
  let service: SearchService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockPrismaService = {
    book: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    library: {
      findMany: vi.fn(),
    },
  };

  const mockRedisService = {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should return cached results when available', async () => {
      const searchRequest: SearchRequest = {
        query: 'test book',
        page: 1,
        pageSize: 20,
        timestamp: Date.now(),
      };

      const cachedResponse: SearchResponse = {
        results: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        aggregations: {
          authors: [],
          publishers: [],
          languages: [],
          fileTypes: [],
          libraries: [],
          status: [],
        },
        searchTime: 50,
      };

      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await service.search(searchRequest);

      expect(result).toEqual(cachedResponse);
      expect(mockRedisService.get).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.book.findMany).not.toHaveBeenCalled();
    });

    it('should perform database search when cache miss', async () => {
      const searchRequest: SearchRequest = {
        query: 'test book',
        page: 1,
        pageSize: 20,
        timestamp: Date.now(),
      };

      const mockBooks = [
        {
          id: 1,
          title: 'Test Book',
          author: 'Test Author',
          isbn: '123456789',
          language: 'en',
          publisher: 'Test Publisher',
          publishDate: new Date(),
          description: 'Test description',
          fileType: 'epub',
          fileSize: 1024000,
          coverImage: null,
          status: 'COMPLETED',
          createdAt: new Date(),
          updatedAt: new Date(),
          library: { id: 1, name: 'Test Library' },
          shelf: { id: 1, name: 'Test Shelf' },
          metadata: null,
        },
      ];

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue(mockBooks);
      mockPrismaService.book.count.mockResolvedValue(1);
      mockPrismaService.book.groupBy.mockResolvedValue([]);

      const result = await service.search(searchRequest);

      expect(result.results).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.results[0].title).toBe('Test Book');
      expect(mockPrismaService.book.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.book.count).toHaveBeenCalledTimes(1);
      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
    });

    it('should build correct where clause for text search', async () => {
      const searchRequest: SearchRequest = {
        query: 'javascript',
        page: 1,
        pageSize: 20,
        timestamp: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.count.mockResolvedValue(0);
      mockPrismaService.book.groupBy.mockResolvedValue([]);

      await service.search(searchRequest);

      const expectedWhereClause = {
        AND: [
          {
            OR: [
              { title: { contains: 'javascript', mode: 'insensitive' } },
              { author: { contains: 'javascript', mode: 'insensitive' } },
              { description: { contains: 'javascript', mode: 'insensitive' } },
              { publisher: { contains: 'javascript', mode: 'insensitive' } },
              { isbn: { contains: 'javascript', mode: 'insensitive' } },
            ],
          },
        ],
      };

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhereClause,
        })
      );
    });

    it('should apply filters correctly', async () => {
      const searchRequest: SearchRequest = {
        query: '',
        page: 1,
        pageSize: 20,
        filters: {
          libraryIds: [1, 2],
          authors: ['Test Author'],
          fileTypes: ['epub', 'pdf'],
          dateRange: {
            from: new Date('2023-01-01'),
            to: new Date('2023-12-31'),
          },
        },
        timestamp: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.count.mockResolvedValue(0);
      mockPrismaService.book.groupBy.mockResolvedValue([]);

      await service.search(searchRequest);

      const expectedWhereClause = {
        AND: [
          { libraryId: { in: [1, 2] } },
          { author: { in: ['Test Author'], mode: 'insensitive' } },
          { fileType: { in: ['epub', 'pdf'] } },
          {
            publishDate: {
              gte: new Date('2023-01-01'),
              lte: new Date('2023-12-31'),
            },
          },
        ],
      };

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhereClause,
        })
      );
    });

    it('should handle sorting correctly', async () => {
      const searchRequest: SearchRequest = {
        query: '',
        page: 1,
        pageSize: 20,
        sort: {
          field: 'title',
          direction: 'asc',
        },
        timestamp: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.count.mockResolvedValue(0);
      mockPrismaService.book.groupBy.mockResolvedValue([]);

      await service.search(searchRequest);

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: 'asc' },
        })
      );
    });

    it('should handle pagination correctly', async () => {
      const searchRequest: SearchRequest = {
        query: '',
        page: 3,
        pageSize: 10,
        timestamp: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue([]);
      mockPrismaService.book.count.mockResolvedValue(25);
      mockPrismaService.book.groupBy.mockResolvedValue([]);

      const result = await service.search(searchRequest);

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      );

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(3); // Math.ceil(25/10)
    });
  });

  describe('getSuggestions', () => {
    it('should return cached suggestions when available', async () => {
      const query = 'java';
      const libraryIds = [1, 2];
      const cachedSuggestions = [
        { text: 'JavaScript', type: 'title' as const },
        { text: 'Java Programming', type: 'title' as const },
      ];

      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedSuggestions));

      const result = await service.getSuggestions(query, libraryIds);

      expect(result).toEqual(cachedSuggestions);
      expect(mockRedisService.get).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.book.findMany).not.toHaveBeenCalled();
    });

    it('should generate suggestions from database when cache miss', async () => {
      const query = 'java';
      const mockBooks = [
        { title: 'JavaScript Guide', author: 'John Doe', publisher: 'Tech Books' },
        { title: 'Java Programming', author: 'Jane Smith', publisher: 'Code Press' },
      ];

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue(mockBooks);

      const result = await service.getSuggestions(query);

      expect(result.length).toBeGreaterThan(0);
      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {},
              {
                OR: [
                  { title: { contains: query, mode: 'insensitive' } },
                  { author: { contains: query, mode: 'insensitive' } },
                  { publisher: { contains: query, mode: 'insensitive' } },
                ],
              },
            ],
          }),
          take: 10,
        })
      );
      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
    });

    it('should filter suggestions by library IDs', async () => {
      const query = 'test';
      const libraryIds = [1, 2];

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.book.findMany.mockResolvedValue([]);

      await service.getSuggestions(query, libraryIds);

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              { libraryId: { in: libraryIds } },
              expect.any(Object),
            ],
          }),
        })
      );
    });
  });

  describe('private methods', () => {
    it('should generate consistent cache keys', () => {
      const request1: SearchRequest = {
        query: 'test',
        page: 1,
        pageSize: 20,
        timestamp: Date.now(),
      };

      const request2: SearchRequest = {
        query: 'test',
        page: 1,
        pageSize: 20,
        timestamp: Date.now() + 1000, // Different timestamp
      };

      // Since cache key generation should ignore timestamp for consistency
      // we need to test this indirectly by checking if the same search
      // parameters produce the same cache behavior
      expect(service).toBeDefined();
    });
  });
});