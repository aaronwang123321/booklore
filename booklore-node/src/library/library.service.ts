import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { CreateLibraryDto, UpdateLibraryDto, LibraryResponseDto } from './dto/library.dto';
import { LibraryRole } from '@prisma/client';
import { Cache, CacheEvict } from '../shared/cache/cache.decorator';
import { RedisService } from '../shared/redis/redis.service';
import { MonitoringService } from '../shared/monitoring/monitoring.service';

@Injectable()
export class LibraryService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private monitoringService: MonitoringService,
  ) {}

  async create(userId: number, createLibraryDto: CreateLibraryDto): Promise<LibraryResponseDto> {
    const library = await this.prisma.library.create({
      data: {
        ...createLibraryDto,
        ownerId: userId,
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

    return library;
  }

  @Cache({
    keyGenerator: (userId: number) => `libraries:user:${userId}`,
    ttl: 300, // 5 minutes
  })
  async findAll(userId: number): Promise<LibraryResponseDto[]> {
    const startTime = process.hrtime.bigint();

    try {
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

      // Record performance metrics
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
      this.monitoringService.recordDatabaseQuery('findMany', 'library', duration / 1000, 'success');

      return libraries;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('findMany', 'library', duration / 1000, 'error');
      throw error;
    }
  }

  @Cache({
    keyGenerator: (id: number, userId: number) => `library:${id}:user:${userId}`,
    ttl: 600, // 10 minutes
  })
  async findOne(id: number, userId: number): Promise<LibraryResponseDto> {
    const startTime = process.hrtime.bigint();

    try {
      const library = await this.prisma.library.findUnique({
        where: { id },
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

      if (!library) {
        throw new NotFoundException('Library not found');
      }

      // Check access permissions
      const hasAccess = await this.checkAccess(id, userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this library');
      }

      // Record performance metrics
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery(
        'findUnique',
        'library',
        duration / 1000,
        'success',
      );

      return library;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('findUnique', 'library', duration / 1000, 'error');
      throw error;
    }
  }

  @CacheEvict('library:*')
  async update(
    id: number,
    userId: number,
    updateLibraryDto: UpdateLibraryDto,
  ): Promise<LibraryResponseDto> {
    // Check if user has admin access
    const hasAdminAccess = await this.checkAdminAccess(id, userId);
    if (!hasAdminAccess) {
      throw new ForbiddenException('Only library admins can update library settings');
    }

    const startTime = process.hrtime.bigint();

    try {
      const library = await this.prisma.library.update({
        where: { id },
        data: updateLibraryDto,
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

      // Invalidate related cache entries
      await this.invalidateLibraryCache(id);

      // Record performance metrics
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('update', 'library', duration / 1000, 'success');

      return library;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('update', 'library', duration / 1000, 'error');
      throw error;
    }
  }

  async remove(id: number, userId: number): Promise<void> {
    const library = await this.prisma.library.findUnique({
      where: { id },
    });

    if (!library) {
      throw new NotFoundException('Library not found');
    }

    // Only owner can delete library
    if (library.ownerId !== userId) {
      throw new ForbiddenException('Only library owner can delete the library');
    }

    await this.prisma.library.delete({
      where: { id },
    });
  }

  async checkAccess(libraryId: number, userId: number): Promise<boolean> {
    const library = await this.prisma.library.findUnique({
      where: { id: libraryId },
      include: {
        members: {
          where: { userId },
        },
      },
    });

    if (!library) {
      return false;
    }

    // Owner has access
    if (library.ownerId === userId) {
      return true;
    }

    // Public libraries are accessible
    if (library.isPublic) {
      return true;
    }

    // Check if user is a member
    return library.members.length > 0;
  }

  async checkAdminAccess(libraryId: number, userId: number): Promise<boolean> {
    const library = await this.prisma.library.findUnique({
      where: { id: libraryId },
      include: {
        members: {
          where: {
            userId,
            role: LibraryRole.ADMIN,
          },
        },
      },
    });

    if (!library) {
      return false;
    }

    // Owner has admin access
    if (library.ownerId === userId) {
      return true;
    }

    // Check if user is an admin member
    return library.members.length > 0;
  }

  @Cache({
    keyGenerator: (libraryId: number, userId: number) =>
      `library:${libraryId}:books:user:${userId}`,
    ttl: 180, // 3 minutes
  })
  async getLibraryBooks(libraryId: number, userId: number) {
    // Check access first
    const hasAccess = await this.checkAccess(libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    const startTime = process.hrtime.bigint();

    try {
      const books = await this.prisma.book.findMany({
        where: { libraryId },
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
      });

      // Record performance metrics
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('findMany', 'book', duration / 1000, 'success');

      return books;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.monitoringService.recordDatabaseQuery('findMany', 'book', duration / 1000, 'error');
      throw error;
    }
  }

  async getLibraryShelves(libraryId: number, userId: number) {
    // Check access first
    const hasAccess = await this.checkAccess(libraryId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this library');
    }

    const shelves = await this.prisma.shelf.findMany({
      where: { libraryId },
      include: {
        _count: {
          select: {
            books: true,
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    return shelves;
  }

  /**
   * Invalidate cache entries related to a specific library
   */
  private async invalidateLibraryCache(libraryId: number): Promise<void> {
    try {
      // Invalidate library-specific cache entries
      await Promise.all([
        this.redisService.invalidatePattern(`library:${libraryId}:*`),
        this.redisService.invalidatePattern(`libraries:user:*`), // Invalidate user library lists
      ]);

      this.monitoringService.recordCacheOperation('del', 'success');
    } catch (error) {
      this.monitoringService.recordCacheOperation('del', 'error');
      // Don't throw error for cache invalidation failures
      console.warn('Failed to invalidate library cache:', error);
    }
  }
}
