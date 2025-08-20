import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetadataService } from './metadata.service';
import { MetadataMatcherService } from './metadata-matcher.service';
import { MetadataHistoryService } from './metadata-history.service';
import { MetadataTemplateService } from './metadata-template.service';
import { GoogleBooksProvider } from '../providers/google-books.provider';
import { GoodreadsProvider } from '../providers/goodreads.provider';
import { AmazonProvider } from '../providers/amazon.provider';
import { PrismaService } from '../../shared/database/prisma.service';
import { MetadataSource } from '../interfaces/metadata.interface';

describe('MetadataService', () => {
  let service: MetadataService;
  let prismaService: PrismaService;
  let googleBooksProvider: GoogleBooksProvider;
  let matcherService: MetadataMatcherService;

  const mockPrismaService = {
    book: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const mockHttpService = {
    get: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockGoogleBooksProvider = {
    name: MetadataSource.GOOGLE_BOOKS,
    search: vi.fn(),
    getByIsbn: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockGoodreadsProvider = {
    name: MetadataSource.GOODREADS,
    search: vi.fn(),
    getByIsbn: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockAmazonProvider = {
    name: MetadataSource.AMAZON,
    search: vi.fn(),
    getByIsbn: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(false),
  };

  const mockMatcherService = {
    findBestMatch: vi.fn(),
    mergeMetadata: vi.fn(),
  };

  const mockHistoryService = {
    recordBulkChanges: vi.fn(),
  };

  const mockTemplateService = {
    applyTemplate: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: GoogleBooksProvider,
          useValue: mockGoogleBooksProvider,
        },
        {
          provide: GoodreadsProvider,
          useValue: mockGoodreadsProvider,
        },
        {
          provide: AmazonProvider,
          useValue: mockAmazonProvider,
        },
        {
          provide: MetadataMatcherService,
          useValue: mockMatcherService,
        },
        {
          provide: MetadataHistoryService,
          useValue: mockHistoryService,
        },
        {
          provide: MetadataTemplateService,
          useValue: mockTemplateService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
    prismaService = module.get<PrismaService>(PrismaService);
    googleBooksProvider = module.get<GoogleBooksProvider>(GoogleBooksProvider);
    matcherService = module.get<MetadataMatcherService>(MetadataMatcherService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchMetadata', () => {
    it('should search metadata across multiple sources', async () => {
      const searchDto = {
        title: 'Test Book',
        author: 'Test Author',
        limit: 10,
      };

      const mockGoogleResults = {
        results: [
          {
            source: MetadataSource.GOOGLE_BOOKS,
            title: 'Test Book',
            author: 'Test Author',
            confidence: 0.9,
          },
        ],
        totalResults: 1,
        source: MetadataSource.GOOGLE_BOOKS,
        query: searchDto,
      };

      const mockGoodreadsResults = {
        results: [
          {
            source: MetadataSource.GOODREADS,
            title: 'Test Book',
            author: 'Test Author',
            confidence: 0.8,
          },
        ],
        totalResults: 1,
        source: MetadataSource.GOODREADS,
        query: searchDto,
      };

      const mockBestMatch = {
        bestMatch: mockGoogleResults.results[0],
        allMatches: [...mockGoogleResults.results, ...mockGoodreadsResults.results],
        confidence: 0.9,
        reasoning: ['Strong title match', 'Strong author match'],
      };

      mockGoogleBooksProvider.search.mockResolvedValue(mockGoogleResults);
      mockGoodreadsProvider.search.mockResolvedValue(mockGoodreadsResults);
      mockMatcherService.findBestMatch.mockReturnValue(mockBestMatch);

      const result = await service.searchMetadata(searchDto);

      expect(result.results).toHaveLength(2);
      expect(result.bestMatch).toEqual(mockBestMatch);
      expect(mockGoogleBooksProvider.search).toHaveBeenCalledWith({
        title: 'Test Book',
        author: 'Test Author',
        isbn: undefined,
        language: undefined,
        year: undefined,
      });
      expect(mockGoodreadsProvider.search).toHaveBeenCalled();
      expect(mockMatcherService.findBestMatch).toHaveBeenCalled();
    });

    it('should handle provider failures gracefully', async () => {
      const searchDto = {
        title: 'Test Book',
        sources: [MetadataSource.GOOGLE_BOOKS],
      };

      mockGoogleBooksProvider.search.mockRejectedValue(new Error('API Error'));
      mockMatcherService.findBestMatch.mockReturnValue({
        bestMatch: null,
        allMatches: [],
        confidence: 0,
        reasoning: ['No metadata found from any source'],
      });

      const result = await service.searchMetadata(searchDto);

      expect(result.results).toHaveLength(0);
      expect(result.bestMatch.bestMatch).toBeNull();
    });
  });

  describe('getMetadataByIsbn', () => {
    it('should get metadata by ISBN from all available sources', async () => {
      const isbn = '9781234567890';
      const mockMetadata = {
        source: MetadataSource.GOOGLE_BOOKS,
        title: 'Test Book',
        author: 'Test Author',
        isbn,
        confidence: 0.9,
      };

      mockGoogleBooksProvider.getByIsbn.mockResolvedValue(mockMetadata);
      mockGoodreadsProvider.getByIsbn.mockResolvedValue(null);
      mockMatcherService.findBestMatch.mockReturnValue({
        bestMatch: mockMetadata,
        allMatches: [mockMetadata],
        confidence: 0.9,
        reasoning: ['Exact ISBN match'],
      });

      const result = await service.getMetadataByIsbn(isbn);

      expect(result.bestMatch).toEqual(mockMetadata);
      expect(mockGoogleBooksProvider.getByIsbn).toHaveBeenCalledWith(isbn);
      expect(mockGoodreadsProvider.getByIsbn).toHaveBeenCalledWith(isbn);
    });
  });

  describe('updateBookMetadata', () => {
    it('should update book metadata and record history', async () => {
      const bookId = 1;
      const userId = 1;
      const updateDto = {
        title: 'Updated Title',
        author: 'Updated Author',
        source: MetadataSource.GOOGLE_BOOKS,
      };

      const currentBook = {
        id: bookId,
        title: 'Original Title',
        author: 'Original Author',
        isbn: null,
        language: null,
        publisher: null,
        publishDate: null,
        description: null,
        genres: [],
        rating: null,
        pageCount: null,
      };

      mockPrismaService.book.findUnique.mockResolvedValue(currentBook);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrismaService);
      });
      mockPrismaService.book.update.mockResolvedValue({});
      mockHistoryService.recordBulkChanges.mockResolvedValue([]);

      await service.updateBookMetadata(bookId, updateDto, userId);

      expect(mockPrismaService.book.findUnique).toHaveBeenCalledWith({
        where: { id: bookId },
      });
      expect(mockPrismaService.book.update).toHaveBeenCalled();
      expect(mockHistoryService.recordBulkChanges).toHaveBeenCalledWith(
        bookId,
        {
          title: { oldValue: 'Original Title', newValue: 'Updated Title' },
          author: { oldValue: 'Original Author', newValue: 'Updated Author' },
        },
        MetadataSource.GOOGLE_BOOKS,
        userId,
        undefined
      );
    });

    it('should throw error if book not found', async () => {
      const bookId = 999;
      const userId = 1;
      const updateDto = {
        title: 'Updated Title',
        source: MetadataSource.GOOGLE_BOOKS,
      };

      mockPrismaService.book.findUnique.mockResolvedValue(null);

      await expect(
        service.updateBookMetadata(bookId, updateDto, userId)
      ).rejects.toThrow('Book 999 not found');
    });
  });

  describe('bulkUpdateMetadata', () => {
    it('should update multiple books with template application', async () => {
      const bulkUpdateDto = {
        bookIds: [1, 2],
        updates: {
          publisher: 'Test Publisher',
          source: MetadataSource.GOOGLE_BOOKS,
        },
        templateId: 1,
      };
      const userId = 1;

      const templateResult = {
        ...bulkUpdateDto.updates,
        language: 'en',
      };

      mockTemplateService.applyTemplate.mockResolvedValue(templateResult);

      // Mock successful updates
      vi.spyOn(service, 'updateBookMetadata').mockResolvedValue(undefined);

      const result = await service.bulkUpdateMetadata(bulkUpdateDto, userId);

      expect(result.successful).toEqual([1, 2]);
      expect(result.failed).toHaveLength(0);
      expect(mockTemplateService.applyTemplate).toHaveBeenCalledWith(
        1,
        bulkUpdateDto.updates,
        userId
      );
    });

    it('should handle individual book update failures', async () => {
      const bulkUpdateDto = {
        bookIds: [1, 2],
        updates: {
          title: 'Updated Title',
          source: MetadataSource.GOOGLE_BOOKS,
        },
      };
      const userId = 1;

      vi
        .spyOn(service, 'updateBookMetadata')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Update failed'));

      const result = await service.bulkUpdateMetadata(bulkUpdateDto, userId);

      expect(result.successful).toEqual([1]);
      expect(result.failed).toEqual([
        { bookId: 2, error: 'Update failed' },
      ]);
    });
  });

  describe('getSourceStatus', () => {
    it('should return status of all metadata sources', async () => {
      const result = await service.getSourceStatus();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        source: MetadataSource.GOOGLE_BOOKS,
        available: true,
        lastChecked: expect.any(Date),
      });
      expect(result[1]).toEqual({
        source: MetadataSource.GOODREADS,
        available: true,
        lastChecked: expect.any(Date),
      });
      expect(result[2]).toEqual({
        source: MetadataSource.AMAZON,
        available: false,
        lastChecked: expect.any(Date),
      });
    });
  });
});