import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { LibraryService } from '../../library/library.service';
import { OpdsXmlGenerator } from './opds-xml-generator.service';
import { OpdsFeed, OpdsEntry, OpdsLink } from '../interfaces/opds.interface';
import { OpdsSearchDto } from '../dto/opds.dto';

@Injectable()
export class OpdsService {
  constructor(
    private prisma: PrismaService,
    private libraryService: LibraryService,
    private xmlGenerator: OpdsXmlGenerator,
  ) {}

  /**
   * Generate root catalog feed
   */
  async generateRootCatalog(userId: number, baseUrl: string): Promise<string> {
    // Get accessible libraries for the user
    const libraries = await this.libraryService.findAll(userId);

    const feed: OpdsFeed = {
      id: `${baseUrl}/opds/catalog`,
      title: 'BookLore Library',
      updated: new Date().toISOString(),
      author: {
        name: 'BookLore',
        uri: baseUrl,
      },
      links: [
        {
          rel: 'start',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Home',
        },
        {
          rel: 'self',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
        },
        {
          rel: 'search',
          href: `${baseUrl}/opds/search.xml`,
          type: 'application/opensearchdescription+xml',
          title: 'Search',
        },
      ],
      entries: libraries.map(library => ({
        id: `${baseUrl}/opds/libraries/${library.id}`,
        title: library.name,
        updated: library.updatedAt.toISOString(),
        summary: library.description || `Library containing ${library._count.books} books`,
        links: [
          {
            rel: 'subsection',
            href: `${baseUrl}/opds/libraries/${library.id}`,
            type: 'application/atom+xml;profile=opds-catalog',
            title: library.name,
          },
        ],
      })),
    };

    return this.xmlGenerator.generateCatalogFeed(feed, baseUrl);
  }

  /**
   * Generate library catalog feed
   */
  async generateLibraryCatalog(
    libraryId: number,
    userId: number,
    baseUrl: string,
  ): Promise<string> {
    // Check access to library
    const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    // Get library details
    const library = await this.libraryService.findOne(libraryId, userId);

    // Get library shelves
    const shelves = await this.libraryService.getLibraryShelves(libraryId, userId);

    const feed: OpdsFeed = {
      id: `${baseUrl}/opds/libraries/${libraryId}`,
      title: library.name,
      updated: library.updatedAt.toISOString(),
      author: {
        name: 'BookLore',
        uri: baseUrl,
      },
      links: [
        {
          rel: 'start',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Home',
        },
        {
          rel: 'up',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Up',
        },
        {
          rel: 'self',
          href: `${baseUrl}/opds/libraries/${libraryId}`,
          type: 'application/atom+xml;profile=opds-catalog',
        },
      ],
      entries: [
        // All books entry
        {
          id: `${baseUrl}/opds/libraries/${libraryId}/books`,
          title: 'All Books',
          updated: library.updatedAt.toISOString(),
          summary: `All ${library._count.books} books in this library`,
          links: [
            {
              rel: 'subsection',
              href: `${baseUrl}/opds/libraries/${libraryId}/books`,
              type: 'application/atom+xml;profile=opds-catalog',
              title: 'All Books',
            },
          ],
        },
        // Shelf entries
        ...shelves.map(shelf => ({
          id: `${baseUrl}/opds/libraries/${libraryId}/shelves/${shelf.id}`,
          title: shelf.name,
          updated: shelf.updatedAt.toISOString(),
          summary: shelf.description || `Shelf containing ${shelf._count.books} books`,
          links: [
            {
              rel: 'subsection',
              href: `${baseUrl}/opds/libraries/${libraryId}/shelves/${shelf.id}`,
              type: 'application/atom+xml;profile=opds-catalog',
              title: shelf.name,
            },
          ],
        })),
      ],
    };

    return this.xmlGenerator.generateCatalogFeed(feed, baseUrl);
  }

  /**
   * Generate books feed for a library
   */
  async generateLibraryBooks(libraryId: number, userId: number, baseUrl: string): Promise<string> {
    // Check access to library
    const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    // Get library and books
    const library = await this.libraryService.findOne(libraryId, userId);
    const books = await this.libraryService.getLibraryBooks(libraryId, userId);

    const feed: OpdsFeed = {
      id: `${baseUrl}/opds/libraries/${libraryId}/books`,
      title: `${library.name} - All Books`,
      updated: new Date().toISOString(),
      author: {
        name: 'BookLore',
        uri: baseUrl,
      },
      links: [
        {
          rel: 'start',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Home',
        },
        {
          rel: 'up',
          href: `${baseUrl}/opds/libraries/${libraryId}`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Up',
        },
        {
          rel: 'self',
          href: `${baseUrl}/opds/libraries/${libraryId}/books`,
          type: 'application/atom+xml;profile=opds-catalog',
        },
      ],
      entries: books.map(book => this.createBookEntry(book, baseUrl)),
    };

    return this.xmlGenerator.generateCatalogFeed(feed, baseUrl);
  }

  /**
   * Generate books feed for a shelf
   */
  async generateShelfBooks(
    libraryId: number,
    shelfId: number,
    userId: number,
    baseUrl: string,
  ): Promise<string> {
    // Check access to library
    const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    // Get shelf details
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId, libraryId },
      include: {
        library: true,
        books: {
          include: {
            shelf: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                chapters: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    const feed: OpdsFeed = {
      id: `${baseUrl}/opds/libraries/${libraryId}/shelves/${shelfId}`,
      title: `${shelf.library.name} - ${shelf.name}`,
      updated: shelf.updatedAt.toISOString(),
      author: {
        name: 'BookLore',
        uri: baseUrl,
      },
      links: [
        {
          rel: 'start',
          href: `${baseUrl}/opds/catalog`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Home',
        },
        {
          rel: 'up',
          href: `${baseUrl}/opds/libraries/${libraryId}`,
          type: 'application/atom+xml;profile=opds-catalog',
          title: 'Up',
        },
        {
          rel: 'self',
          href: `${baseUrl}/opds/libraries/${libraryId}/shelves/${shelfId}`,
          type: 'application/atom+xml;profile=opds-catalog',
        },
      ],
      entries: shelf.books.map(book => this.createBookEntry(book, baseUrl)),
    };

    return this.xmlGenerator.generateCatalogFeed(feed, baseUrl);
  }

  /**
   * Search books and generate search results feed
   */
  async searchBooks(searchDto: OpdsSearchDto, userId: number, baseUrl: string): Promise<string> {
    const { q: query, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Get accessible libraries for the user
    const libraries = await this.libraryService.findAll(userId);
    const libraryIds = libraries.map(lib => lib.id);

    // Search books in accessible libraries
    const [books, totalCount] = await Promise.all([
      this.prisma.book.findMany({
        where: {
          libraryId: { in: libraryIds },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { author: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { isbn: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          shelf: {
            select: {
              id: true,
              name: true,
            },
          },
          library: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              chapters: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.book.count({
        where: {
          libraryId: { in: libraryIds },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { author: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { isbn: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    const entries = books.map(book => this.createBookEntry(book, baseUrl));

    return this.xmlGenerator.generateSearchFeed(
      query,
      entries,
      totalCount,
      skip + 1,
      limit,
      baseUrl,
    );
  }

  /**
   * Generate OpenSearch description
   */
  generateOpenSearchDescription(baseUrl: string): string {
    return this.xmlGenerator.generateOpenSearchDescription(baseUrl);
  }

  /**
   * Get book download stream
   */
  async getBookDownload(bookId: number, userId: number) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        library: true,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check access to library
    const hasAccess = await this.libraryService.checkAccess(book.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this book');
    }

    return {
      filePath: book.filePath,
      fileName: book.fileName,
      mimeType: book.mimeType,
      fileSize: book.fileSize,
    };
  }

  /**
   * Create book entry for OPDS feed
   */
  private createBookEntry(book: any, baseUrl: string): OpdsEntry {
    const links: OpdsLink[] = [
      {
        rel: 'http://opds-spec.org/acquisition',
        href: `${baseUrl}/opds/books/${book.id}/download`,
        type: book.mimeType,
        title: `Download ${book.title}`,
      },
    ];

    // Add cover image link if available
    if (book.coverImage) {
      links.push({
        rel: 'http://opds-spec.org/image',
        href: `${baseUrl}/api/v1/books/${book.id}/cover`,
        type: 'image/jpeg',
        title: 'Cover Image',
      });

      links.push({
        rel: 'http://opds-spec.org/image/thumbnail',
        href: `${baseUrl}/api/v1/books/${book.id}/cover?size=thumbnail`,
        type: 'image/jpeg',
        title: 'Thumbnail',
      });
    }

    return {
      id: `${baseUrl}/opds/books/${book.id}`,
      title: book.title,
      updated: book.updatedAt.toISOString(),
      author: book.author || 'Unknown Author',
      summary: book.description || '',
      content: this.generateBookContent(book),
      links,
    };
  }

  /**
   * Generate book content description
   */
  private generateBookContent(book: any): string {
    const details = [];

    if (book.author) details.push(`Author: ${book.author}`);
    if (book.publisher) details.push(`Publisher: ${book.publisher}`);
    if (book.publishDate) details.push(`Published: ${new Date(book.publishDate).getFullYear()}`);
    if (book.language) details.push(`Language: ${book.language}`);
    if (book.isbn) details.push(`ISBN: ${book.isbn}`);
    if (book._count?.chapters) details.push(`Chapters: ${book._count.chapters}`);
    if (book.library?.name) details.push(`Library: ${book.library.name}`);
    if (book.shelf?.name) details.push(`Shelf: ${book.shelf.name}`);

    let content = details.join(' | ');

    if (book.description) {
      content += `\n\n${book.description}`;
    }

    return content;
  }
}
