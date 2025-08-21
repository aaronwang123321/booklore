import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { CreateAuthorDto, UpdateAuthorDto } from './dto/author.dto';

@Injectable()
export class AuthorService {
  constructor(private readonly prisma: PrismaService) {}

  async create_author(createAuthorDto: CreateAuthorDto) {
    return this.prisma.author.create({
      data: createAuthorDto,
    });
  }

  async find_all_authors() {
    return this.prisma.author.findMany({
      include: {
        books: {
          include: {
            book: {
              select: {
                id: true,
                title: true,
                coverImage: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async find_author_by_id(id: number) {
    const author = await this.prisma.author.findUnique({
      where: { id },
      include: {
        books: {
          include: {
            book: {
              select: {
                id: true,
                title: true,
                coverImage: true,
                publishDate: true,
                rating: true,
              },
            },
          },
        },
      },
    });

    if (!author) {
      throw new NotFoundException(`Author with ID ${id} not found`);
    }

    return author;
  }

  async update_author(id: number, updateAuthorDto: UpdateAuthorDto) {
    const author = await this.prisma.author.findUnique({ where: { id } });
    if (!author) {
      throw new NotFoundException(`Author with ID ${id} not found`);
    }

    return this.prisma.author.update({
      where: { id },
      data: updateAuthorDto,
    });
  }

  async delete_author(id: number): Promise<void> {
    const author = await this.prisma.author.findUnique({ where: { id } });
    if (!author) {
      throw new NotFoundException(`Author with ID ${id} not found`);
    }

    await this.prisma.author.delete({ where: { id } });
  }

  async get_authors_by_book_id(bookId: number): Promise<string[]> {
    const bookAuthors = await this.prisma.bookAuthor.findMany({
      where: { bookId },
      include: {
        author: true,
      },
    });

    return bookAuthors.map(ba => ba.author.name);
  }

  async add_author_to_book(bookId: number, authorId: number, role: string = 'author') {
    return this.prisma.bookAuthor.create({
      data: {
        bookId,
        authorId,
        role,
      },
    });
  }

  async remove_author_from_book(bookId: number, authorId: number): Promise<void> {
    await this.prisma.bookAuthor.deleteMany({
      where: {
        bookId,
        authorId,
      },
    });
  }

  async search_authors(query: string) {
    return this.prisma.author.findMany({
      where: {
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            biography: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        books: {
          include: {
            book: {
              select: {
                id: true,
                title: true,
                coverImage: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
