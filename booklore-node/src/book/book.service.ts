import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { LibraryService } from '../library/library.service';
import { CreateBookDto, UpdateBookDto, BookResponseDto } from './dto/book.dto';
import { BookStatus } from '@prisma/client';

@Injectable()
export class BookService {
  constructor(
    private prisma: PrismaService,
    private libraryService: LibraryService,
  ) {}

  async create(
    userId: number,
    createBookDto: CreateBookDto,
    file?: Express.Multer.File,
  ): Promise<BookResponseDto> {
    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(createBookDto.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    // If file is provided, set file-related fields
    const bookData: any = {
      ...createBookDto,
      status: BookStatus.PROCESSING,
    };

    if (file) {
      bookData.filePath = file.path || file.filename;
      bookData.fileName = file.originalname;
      bookData.fileSize = file.size;
      bookData.fileType = file.originalname.split('.').pop()?.toLowerCase() || '';
      bookData.mimeType = file.mimetype;
    } else {
      // For books without files (metadata only)
      bookData.filePath = '';
      bookData.fileName = '';
      bookData.fileSize = 0;
      bookData.fileType = '';
      bookData.mimeType = '';
      bookData.status = BookStatus.COMPLETED;
    }

    const book = await this.prisma.book.create({
      data: bookData,
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    return book;
  }

  async findAll(userId: number, libraryId?: number): Promise<BookResponseDto[]> {
    const whereClause: any = {};

    if (libraryId) {
      // Check access to specific library
      const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this library');
      }
      whereClause.libraryId = libraryId;
    } else {
      // Get books from all accessible libraries
      const accessibleLibraries = await this.getAccessibleLibraryIds(userId);
      whereClause.libraryId = {
        in: accessibleLibraries,
      };
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return books;
  }

  async findOne(id: number, userId: number): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(book.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this book');
    }

    return book;
  }

  async update(id: number, userId: number, updateBookDto: UpdateBookDto): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(book.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this book');
    }

    const updatedBook = await this.prisma.book.update({
      where: { id },
      data: updateBookDto,
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    return updatedBook;
  }

  async remove(id: number, userId: number): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check if user has admin access to the library
    const hasAdminAccess = await this.libraryService.checkAdminAccess(book.libraryId, userId);
    if (!hasAdminAccess) {
      throw new ForbiddenException('Only library admins can delete books');
    }

    await this.prisma.book.delete({
      where: { id },
    });
  }

  async moveToShelf(
    bookId: number,
    shelfId: number | null,
    userId: number,
  ): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(book.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this book');
    }

    // If moving to a shelf, verify the shelf belongs to the same library
    if (shelfId) {
      const shelf = await this.prisma.shelf.findUnique({
        where: { id: shelfId },
      });

      if (!shelf || shelf.libraryId !== book.libraryId) {
        throw new NotFoundException('Shelf not found or does not belong to the same library');
      }
    }

    const updatedBook = await this.prisma.book.update({
      where: { id: bookId },
      data: { shelfId },
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    return updatedBook;
  }

  async searchBooks(userId: number, query: string, libraryId?: number): Promise<BookResponseDto[]> {
    const whereClause: any = {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { author: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { isbn: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (libraryId) {
      // Check access to specific library
      const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this library');
      }
      whereClause.libraryId = libraryId;
    } else {
      // Search in all accessible libraries
      const accessibleLibraries = await this.getAccessibleLibraryIds(userId);
      whereClause.libraryId = {
        in: accessibleLibraries,
      };
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        shelf: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            href: true,
            order: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return books;
  }

  private async getAccessibleLibraryIds(userId: number): Promise<number[]> {
    const libraries = await this.prisma.library.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { isPublic: true },
          {
            members: {
              some: {
                userId: userId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return libraries.map(lib => lib.id);
  }
}
