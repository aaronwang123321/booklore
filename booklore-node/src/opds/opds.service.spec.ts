import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpdsService } from './services/opds.service';
import { OpdsXmlGenerator } from './services/opds-xml-generator.service';
import { PrismaService } from '../shared/database/prisma.service';
import { LibraryService } from '../library/library.service';

describe('OpdsService', () => {
  let service: OpdsService;
  let xmlGenerator: OpdsXmlGenerator;
  let prismaService: PrismaService;
  let libraryService: LibraryService;

  const mockPrismaService = {
    library: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    book: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    shelf: {
      findUnique: vi.fn(),
    },
  };

  const mockLibraryService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    checkAccess: vi.fn(),
    getLibraryBooks: vi.fn(),
    getLibraryShelves: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpdsService,
        OpdsXmlGenerator,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LibraryService,
          useValue: mockLibraryService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OpdsService>(OpdsService);
    xmlGenerator = module.get<OpdsXmlGenerator>(OpdsXmlGenerator);
    prismaService = module.get<PrismaService>(PrismaService);
    libraryService = module.get<LibraryService>(LibraryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRootCatalog', () => {
    it('should generate root catalog XML', async () => {
      const mockLibraries = [
        {
          id: 1,
          name: 'Test Library',
          description: 'Test Description',
          updatedAt: new Date('2023-01-01'),
          _count: { books: 5 },
        },
      ];

      mockLibraryService.findAll.mockResolvedValue(mockLibraries);

      const result = await service.generateRootCatalog(1, 'http://localhost:3000');

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('xmlns="http://www.w3.org/2005/Atom"');
      expect(result).toContain('xmlns:opds="http://opds-spec.org/2010/catalog"');
      expect(result).toContain('BookLore Library');
      expect(result).toContain('Test Library');
      expect(mockLibraryService.findAll).toHaveBeenCalledWith(1);
    });
  });

  describe('generateLibraryCatalog', () => {
    it('should generate library catalog XML', async () => {
      const mockLibrary = {
        id: 1,
        name: 'Test Library',
        description: 'Test Description',
        updatedAt: new Date('2023-01-01'),
        _count: { books: 5 },
      };

      const mockShelves = [
        {
          id: 1,
          name: 'Fiction',
          description: 'Fiction books',
          updatedAt: new Date('2023-01-01'),
          _count: { books: 3 },
        },
      ];

      mockLibraryService.checkAccess.mockResolvedValue(true);
      mockLibraryService.findOne.mockResolvedValue(mockLibrary);
      mockLibraryService.getLibraryShelves.mockResolvedValue(mockShelves);

      const result = await service.generateLibraryCatalog(1, 1, 'http://localhost:3000');

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('Test Library');
      expect(result).toContain('All Books');
      expect(result).toContain('Fiction');
      expect(mockLibraryService.checkAccess).toHaveBeenCalledWith(1, 1);
    });

    it('should throw ForbiddenException when access denied', async () => {
      mockLibraryService.checkAccess.mockResolvedValue(false);

      await expect(
        service.generateLibraryCatalog(1, 1, 'http://localhost:3000')
      ).rejects.toThrow('Access denied to this library');
    });
  });

  describe('searchBooks', () => {
    it('should search books and return XML feed', async () => {
      const mockLibraries = [{ id: 1 }];
      const mockBooks = [
        {
          id: 1,
          title: 'Test Book',
          author: 'Test Author',
          description: 'Test Description',
          updatedAt: new Date('2023-01-01'),
          mimeType: 'application/epub+zip',
          coverImage: 'cover.jpg',
          library: { id: 1, name: 'Test Library' },
          shelf: { id: 1, name: 'Fiction' },
          _count: { chapters: 10 },
        },
      ];

      mockLibraryService.findAll.mockResolvedValue(mockLibraries);
      mockPrismaService.book.findMany.mockResolvedValue(mockBooks);
      mockPrismaService.book.count.mockResolvedValue(1);

      const result = await service.searchBooks(
        { q: 'test', page: 1, limit: 20 },
        1,
        'http://localhost:3000'
      );

      expect(result).toContain('Search Results for "test"');
      expect(result).toContain('Test Book');
      expect(result).toContain('opensearch:totalResults>1</opensearch:totalResults>');
      expect(mockPrismaService.book.findMany).toHaveBeenCalled();
      expect(mockPrismaService.book.count).toHaveBeenCalled();
    });
  });

  describe('generateOpenSearchDescription', () => {
    it('should generate OpenSearch description XML', () => {
      const result = service.generateOpenSearchDescription('http://localhost:3000');

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<OpenSearchDescription');
      expect(result).toContain('BookLore');
      expect(result).toContain('http://localhost:3000/opds/search');
    });
  });
});

describe('OpdsXmlGenerator', () => {
  let generator: OpdsXmlGenerator;

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpdsXmlGenerator,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    generator = module.get<OpdsXmlGenerator>(OpdsXmlGenerator);
  });

  it('should be defined', () => {
    expect(generator).toBeDefined();
  });

  describe('generateCatalogFeed', () => {
    it('should generate valid OPDS catalog XML', () => {
      const feed = {
        id: 'http://localhost:3000/opds/catalog',
        title: 'Test Catalog',
        updated: '2023-01-01T00:00:00.000Z',
        author: { name: 'BookLore' },
        links: [
          {
            rel: 'start',
            href: 'http://localhost:3000/opds/catalog',
            type: 'application/atom+xml;profile=opds-catalog',
          },
        ],
        entries: [
          {
            id: 'http://localhost:3000/opds/books/1',
            title: 'Test Book',
            updated: '2023-01-01T00:00:00.000Z',
            author: 'Test Author',
            links: [
              {
                rel: 'http://opds-spec.org/acquisition',
                href: 'http://localhost:3000/opds/books/1/download',
                type: 'application/epub+zip',
              },
            ],
          },
        ],
      };

      const result = generator.generateCatalogFeed(feed, 'http://localhost:3000');

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('xmlns="http://www.w3.org/2005/Atom"');
      expect(result).toContain('xmlns:opds="http://opds-spec.org/2010/catalog"');
      expect(result).toContain('<title>Test Catalog</title>');
      expect(result).toContain('<entry>');
      expect(result).toContain('Test Book');
      expect(result).toContain('Test Author');
    });
  });

  describe('generateSearchFeed', () => {
    it('should generate valid search results XML', () => {
      const entries = [
        {
          id: 'http://localhost:3000/opds/books/1',
          title: 'Test Book',
          updated: '2023-01-01T00:00:00.000Z',
          author: 'Test Author',
          links: [],
        },
      ];

      const result = generator.generateSearchFeed(
        'test query',
        entries,
        1,
        1,
        20,
        'http://localhost:3000'
      );

      expect(result).toContain('Search Results for "test query"');
      expect(result).toContain('opensearch:totalResults>1</opensearch:totalResults>');
      expect(result).toContain('opensearch:startIndex>1</opensearch:startIndex>');
      expect(result).toContain('opensearch:itemsPerPage>20</opensearch:itemsPerPage>');
    });
  });

  describe('generateOpenSearchDescription', () => {
    it('should generate valid OpenSearch description', () => {
      const result = generator.generateOpenSearchDescription('http://localhost:3000');

      expect(result).toContain('<OpenSearchDescription');
      expect(result).toContain('<ShortName>BookLore</ShortName>');
      expect(result).toContain('template="http://localhost:3000/opds/search');
    });
  });
});