import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { CreateMagicShelfDto, UpdateMagicShelfDto } from './dto/magic-shelf.dto';

@Injectable()
export class MagicShelfService {
  constructor(private readonly prisma: PrismaService) {}

  async create_magic_shelf(userId: number, createMagicShelfDto: CreateMagicShelfDto) {
    return this.prisma.magicShelf.create({
      data: {
        name: createMagicShelfDto.name,
        description: createMagicShelfDto.description,
        query: createMagicShelfDto.query,
        libraryId: createMagicShelfDto.libraryId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        library: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async find_all_magic_shelves_by_user(userId: number) {
    return this.prisma.magicShelf.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
  }

  async find_magic_shelf_by_id(id: number, userId?: number) {
    const magicShelf = await this.prisma.magicShelf.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        library: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!magicShelf) {
      throw new NotFoundException(`Magic shelf with ID ${id} not found`);
    }

    // Check if user has access to this magic shelf
    if (userId && magicShelf.userId !== userId) {
      throw new ForbiddenException('Access denied to this magic shelf');
    }

    return magicShelf;
  }

  async update_magic_shelf(id: number, userId: number, updateMagicShelfDto: UpdateMagicShelfDto) {
    // First check if the magic shelf exists and belongs to the user
    await this.find_magic_shelf_by_id(id, userId);

    return this.prisma.magicShelf.update({
      where: { id },
      data: updateMagicShelfDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        library: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async delete_magic_shelf(id: number, userId: number) {
    // First check if the magic shelf exists and belongs to the user
    await this.find_magic_shelf_by_id(id, userId);

    return this.prisma.magicShelf.delete({
      where: { id },
    });
  }

  async find_magic_shelves_by_library(libraryId: number) {
    return this.prisma.magicShelf.findMany({
      where: { libraryId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
  }

  async generate_smart_recommendations(userId: number, libraryId?: number) {
    // This is a simplified smart recommendation algorithm
    // In a real implementation, this would use ML algorithms or more sophisticated logic

    const whereClause: any = {};
    if (libraryId) {
      whereClause.libraryId = libraryId;
    }

    // Get user's reading history and preferences
    const userProgress = await this.prisma.userBookProgress.findMany({
      where: { userId },
      include: {
        book: {
          include: {
            authors: {
              include: {
                author: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastReadAt: 'desc',
      },
      take: 10,
    });

    // Extract genres and authors from reading history
    const readGenres = new Set<string>();
    const readAuthors = new Set<number>();

    userProgress.forEach(progress => {
      if (progress.book.genres && progress.book.genres.length > 0) {
        progress.book.genres.forEach(genre => readGenres.add(genre));
      }
      progress.book.authors.forEach(bookAuthor => {
        readAuthors.add(bookAuthor.author.id);
      });
    });

    // Find books with similar genres or authors that user hasn't read
    const readBookIds = userProgress.map(p => p.book.id);

    const recommendations = await this.prisma.book.findMany({
      where: {
        ...whereClause,
        id: {
          notIn: readBookIds,
        },
        OR: [
          {
            genres: {
              hasSome: Array.from(readGenres),
            },
          },
          {
            authors: {
              some: {
                authorId: {
                  in: Array.from(readAuthors),
                },
              },
            },
          },
        ],
      },
      include: {
        authors: {
          include: {
            author: true,
          },
        },
      },
      take: 20,
    });

    return recommendations;
  }

  async create_smart_shelf_from_recommendations(userId: number, libraryId?: number) {
    const recommendations = await this.generate_smart_recommendations(userId, libraryId);

    if (recommendations.length === 0) {
      throw new NotFoundException('No recommendations found for smart shelf creation');
    }

    // Create a smart shelf with recommended books
    const smartShelf = await this.create_magic_shelf(userId, {
      name: 'Smart Recommendations',
      description: 'Automatically generated recommendations based on your reading history',
      query: JSON.stringify({
        type: 'smart_recommendations',
        generated_at: new Date().toISOString(),
        book_count: recommendations.length,
      }),
      libraryId,
    });

    return {
      shelf: smartShelf,
      recommendations,
    };
  }
}
