import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { CreateShelfDto, UpdateShelfDto, ShelfResponseDto } from './dto/shelf.dto';
import { LibraryService } from '../library/library.service';

@Injectable()
export class ShelfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly libraryService: LibraryService,
  ) {}

  async create(userId: number, createShelfDto: CreateShelfDto): Promise<ShelfResponseDto> {
    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(createShelfDto.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    // Get the next order number if not provided
    let order = createShelfDto.order;
    if (order === undefined) {
      const lastShelf = await this.prisma.shelf.findFirst({
        where: { libraryId: createShelfDto.libraryId },
        orderBy: { order: 'desc' },
      });
      order = (lastShelf?.order || 0) + 1;
    }

    const shelf = await this.prisma.shelf.create({
      data: {
        name: createShelfDto.name,
        description: createShelfDto.description,
        color: createShelfDto.color,
        order,
        libraryId: createShelfDto.libraryId,
      },
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    return {
      id: shelf.id,
      name: shelf.name,
      description: shelf.description,
      color: shelf.color,
      order: shelf.order,
      libraryId: shelf.libraryId,
      createdAt: shelf.createdAt,
      updatedAt: shelf.updatedAt,
      bookCount: shelf._count.books,
      library: shelf.library,
    };
  }

  async findAll(userId: number, libraryId?: number): Promise<ShelfResponseDto[]> {
    const whereClause: any = {};

    if (libraryId) {
      // Check if user has access to the specific library
      const hasAccess = await this.libraryService.checkAccess(libraryId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this library');
      }
      whereClause.libraryId = libraryId;
    } else {
      // Get all libraries the user has access to
      const accessibleLibraries = await this.libraryService.findAll(userId);
      const libraryIds = accessibleLibraries.map(lib => lib.id);
      whereClause.libraryId = { in: libraryIds };
    }

    const shelves = await this.prisma.shelf.findMany({
      where: whereClause,
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            books: true,
          },
        },
      },
      orderBy: [{ libraryId: 'asc' }, { order: 'asc' }],
    });

    return shelves.map(shelf => ({
      id: shelf.id,
      name: shelf.name,
      description: shelf.description,
      color: shelf.color,
      order: shelf.order,
      libraryId: shelf.libraryId,
      createdAt: shelf.createdAt,
      updatedAt: shelf.updatedAt,
      bookCount: shelf._count.books,
      library: shelf.library,
    }));
  }

  async findOne(id: number, userId: number): Promise<ShelfResponseDto> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id },
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    return {
      id: shelf.id,
      name: shelf.name,
      description: shelf.description,
      color: shelf.color,
      order: shelf.order,
      libraryId: shelf.libraryId,
      createdAt: shelf.createdAt,
      updatedAt: shelf.updatedAt,
      bookCount: shelf._count.books,
      library: shelf.library,
    };
  }

  async update(
    id: number,
    userId: number,
    updateShelfDto: UpdateShelfDto,
  ): Promise<ShelfResponseDto> {
    const existingShelf = await this.prisma.shelf.findUnique({
      where: { id },
    });

    if (!existingShelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(existingShelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    const shelf = await this.prisma.shelf.update({
      where: { id },
      data: {
        name: updateShelfDto.name,
        description: updateShelfDto.description,
        color: updateShelfDto.color,
        order: updateShelfDto.order,
      },
      include: {
        library: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    return {
      id: shelf.id,
      name: shelf.name,
      description: shelf.description,
      color: shelf.color,
      order: shelf.order,
      libraryId: shelf.libraryId,
      createdAt: shelf.createdAt,
      updatedAt: shelf.updatedAt,
      bookCount: shelf._count.books,
      library: shelf.library,
    };
  }

  async remove(id: number, userId: number): Promise<void> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    // Check if shelf has books
    if (shelf._count.books > 0) {
      throw new BadRequestException(
        'Cannot delete shelf that contains books. Please move books to another shelf first.',
      );
    }

    await this.prisma.shelf.delete({
      where: { id },
    });
  }

  async getShelfBooks(id: number, userId: number) {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    const books = await this.prisma.book.findMany({
      where: { shelfId: id },
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return books;
  }

  async addBooksToShelf(
    shelfId: number,
    userId: number,
    bookIds: number[],
  ): Promise<{ addedCount: number }> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    // Verify that all books belong to the same library as the shelf
    const books = await this.prisma.book.findMany({
      where: {
        id: { in: bookIds },
        libraryId: shelf.libraryId,
      },
    });

    if (books.length !== bookIds.length) {
      throw new BadRequestException(
        'Some books do not exist or do not belong to the same library as the shelf',
      );
    }

    // Update books to assign them to the shelf
    const result = await this.prisma.book.updateMany({
      where: {
        id: { in: bookIds },
        libraryId: shelf.libraryId,
      },
      data: {
        shelfId: shelfId,
      },
    });

    return { addedCount: result.count };
  }

  async removeBooksFromShelf(
    shelfId: number,
    userId: number,
    bookIds: number[],
  ): Promise<{ removedCount: number }> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    // Update books to remove them from the shelf
    const result = await this.prisma.book.updateMany({
      where: {
        id: { in: bookIds },
        shelfId: shelfId,
      },
      data: {
        shelfId: null,
      },
    });

    return { removedCount: result.count };
  }

  async reorderShelf(shelfId: number, userId: number, newOrder: number): Promise<void> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId },
    });

    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }

    // Check if user has access to the library
    const hasAccess = await this.libraryService.checkAccess(shelf.libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this shelf');
    }

    const currentOrder = shelf.order;

    if (currentOrder === newOrder) {
      return; // No change needed
    }

    // Use a transaction to reorder shelves
    await this.prisma.$transaction(async tx => {
      if (newOrder > currentOrder) {
        // Moving down: decrease order of shelves between current and new position
        await tx.shelf.updateMany({
          where: {
            libraryId: shelf.libraryId,
            order: {
              gt: currentOrder,
              lte: newOrder,
            },
          },
          data: {
            order: {
              decrement: 1,
            },
          },
        });
      } else {
        // Moving up: increase order of shelves between new and current position
        await tx.shelf.updateMany({
          where: {
            libraryId: shelf.libraryId,
            order: {
              gte: newOrder,
              lt: currentOrder,
            },
          },
          data: {
            order: {
              increment: 1,
            },
          },
        });
      }

      // Update the target shelf's order
      await tx.shelf.update({
        where: { id: shelfId },
        data: { order: newOrder },
      });
    });
  }
}
