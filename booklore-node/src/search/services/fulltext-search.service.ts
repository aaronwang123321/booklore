import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { Prisma } from '@prisma/client';

export interface FullTextSearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  libraryId?: number;
  userId?: number;
}

export interface FullTextSearchResult {
  books: any[];
  total: number;
  hasMore: boolean;
}

@Injectable()
export class FullTextSearchService {
  constructor(private prisma: PrismaService) {}

  async searchBooks(options: FullTextSearchOptions): Promise<FullTextSearchResult> {
    const { query, limit = 20, offset = 0, libraryId, userId } = options;

    // 如果没有查询词，返回空结果
    if (!query.trim()) {
      return {
        books: [],
        total: 0,
        hasMore: false,
      };
    }

    // 构建权限过滤条件
    let libraryFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (libraryId) {
      libraryFilter = `AND b."libraryId" = $${paramIndex}`;
      params.push(libraryId);
      paramIndex++;
    } else if (userId) {
      libraryFilter = `
        AND (
          l."ownerId" = $${paramIndex}
          OR l."isPublic" = true
          OR EXISTS (
            SELECT 1 FROM library_members lm
            WHERE lm."libraryId" = b."libraryId"
            AND lm."userId" = $${paramIndex}
          )
        )`;
      params.push(userId);
      paramIndex++;
    }

    // 准备搜索查询
    const searchQuery = query
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .join(' & ');
    params.push(searchQuery, limit, offset);

    // 使用PostgreSQL全文搜索的SQL查询
    const searchSql = `
      SELECT
        b.*,
        l.id as "library_id",
        l.name as "library_name",
        l."isPublic" as "library_isPublic",
        s.id as "shelf_id",
        s.name as "shelf_name",
        ts_rank(b.search_vector, to_tsquery('english', $${paramIndex - 2})) as rank
      FROM books b
      LEFT JOIN libraries l ON b."libraryId" = l.id
      LEFT JOIN shelves s ON b."shelfId" = s.id
      WHERE b.status = 'COMPLETED'
        AND b.search_vector @@ to_tsquery('english', $${paramIndex - 2})
        ${libraryFilter}
      ORDER BY rank DESC, b."createdAt" DESC
      LIMIT $${paramIndex - 1} OFFSET $${paramIndex}
    `;

    // 计数查询
    const countSql = `
      SELECT COUNT(*) as total
      FROM books b
      LEFT JOIN libraries l ON b."libraryId" = l.id
      WHERE b.status = 'COMPLETED'
        AND b.search_vector @@ to_tsquery('english', $${paramIndex - 2})
        ${libraryFilter}
    `;

    try {
      // 执行搜索和计数查询
      const [searchResults, countResults] = await Promise.all([
        this.prisma.$queryRawUnsafe(searchSql, ...params),
        this.prisma.$queryRawUnsafe(countSql, ...params.slice(0, -2)), // 移除limit和offset参数
      ]);

      const books = (searchResults as any[]).map(row => ({
        id: row.id,
        title: row.title,
        author: row.author,
        isbn: row.isbn,
        language: row.language,
        publisher: row.publisher,
        publishDate: row.publishDate,
        description: row.description,
        filePath: row.filePath,
        fileName: row.fileName,
        fileSize: row.fileSize,
        fileType: row.fileType,
        mimeType: row.mimeType,
        coverImage: row.coverImage,
        metadata: row.metadata,
        genres: row.genres,
        rating: row.rating,
        pageCount: row.pageCount,
        status: row.status,
        error: row.error,
        processedAt: row.processedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        libraryId: row.libraryId,
        shelfId: row.shelfId,
        rank: parseFloat(row.rank),
        library: row.library_id
          ? {
              id: row.library_id,
              name: row.library_name,
              isPublic: row.library_isPublic,
            }
          : null,
        shelf: row.shelf_id
          ? {
              id: row.shelf_id,
              name: row.shelf_name,
            }
          : null,
      }));

      const total = parseInt((countResults as any[])[0]?.total || '0');

      return {
        books,
        total,
        hasMore: offset + books.length < total,
      };
    } catch (error) {
      console.error('Full-text search error:', error);
      // 如果全文搜索失败，回退到基本搜索
      return this.fallbackSearch(options);
    }
  }

  private async fallbackSearch(options: FullTextSearchOptions): Promise<FullTextSearchResult> {
    const { query, limit = 20, offset = 0, libraryId, userId } = options;

    // 构建基础查询条件
    const whereConditions: Prisma.BookWhereInput = {
      status: 'COMPLETED',
    };

    // 添加图书馆权限过滤
    if (libraryId) {
      whereConditions.libraryId = libraryId;
    }

    // 如果提供了用户ID，只搜索用户有权限访问的图书馆
    if (userId && !libraryId) {
      whereConditions.library = {
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
      };
    }

    // 添加搜索条件
    if (query.trim()) {
      whereConditions.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          author: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          publisher: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          genres: {
            hasSome: [query],
          },
        },
      ];
    }

    // 执行搜索
    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where: whereConditions,
        include: {
          library: {
            select: {
              id: true,
              name: true,
              isPublic: true,
            },
          },
          shelf: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.book.count({
        where: whereConditions,
      }),
    ]);

    return {
      books,
      total,
      hasMore: offset + books.length < total,
    };
  }

  async getSearchSuggestions(query: string, limit = 5): Promise<string[]> {
    if (!query.trim()) {
      return [];
    }

    try {
      // 使用PostgreSQL全文搜索获取建议
      const searchQuery = query
        .trim()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .join(' & ');

      const suggestions = await this.prisma.$queryRawUnsafe(
        `
        SELECT DISTINCT
          CASE
            WHEN title ILIKE $1 THEN title
            WHEN author ILIKE $1 THEN author
            ELSE NULL
          END as suggestion
        FROM books
        WHERE status = 'COMPLETED'
          AND (title ILIKE $1 OR author ILIKE $1)
          AND search_vector @@ to_tsquery('english', $2)
        ORDER BY suggestion
        LIMIT $3
      `,
        `%${query}%`,
        searchQuery,
        limit,
      );

      return (suggestions as any[]).map(row => row.suggestion).filter(Boolean);
    } catch (error) {
      console.error('Search suggestions error:', error);
      // 回退到基本建议
      return this.fallbackSuggestions(query, limit);
    }
  }

  private async fallbackSuggestions(query: string, limit: number): Promise<string[]> {
    // 获取标题建议
    const titleSuggestions = await this.prisma.book.findMany({
      where: {
        title: {
          contains: query,
          mode: 'insensitive',
        },
        status: 'COMPLETED',
      },
      select: {
        title: true,
      },
      take: limit,
      distinct: ['title'],
    });

    // 获取作者建议
    const authorSuggestions = await this.prisma.book.findMany({
      where: {
        author: {
          contains: query,
          mode: 'insensitive',
        },
        status: 'COMPLETED',
      },
      select: {
        author: true,
      },
      take: limit,
      distinct: ['author'],
    });

    // 合并并去重建议
    const suggestions = [
      ...titleSuggestions.map(book => book.title),
      ...authorSuggestions.map(book => book.author).filter(Boolean),
    ];

    return [...new Set(suggestions)].slice(0, limit);
  }
}
