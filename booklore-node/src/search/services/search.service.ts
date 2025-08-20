import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  SearchRequest,
  SearchResponse,
  SearchAggregations,
  SearchSuggestion,
  SearchResult,
} from '../interfaces/search.interface';
import { Prisma } from '@prisma/client';
import { FullTextSearchService, FullTextSearchOptions } from './fulltext-search.service';

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private fullTextSearchService: FullTextSearchService,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(request);

    // 尝试从缓存获取结果
    const cachedResult = await this.redis.get(cacheKey);
    if (cachedResult) {
      return JSON.parse(cachedResult);
    }

    // 如果有查询文本，优先使用全文搜索
    if (request.query && request.query.trim().length > 0) {
      return this.performFullTextSearch(request, startTime);
    }

    // 否则使用传统搜索
    return this.performTraditionalSearch(request, startTime);
  }

  private async performFullTextSearch(
    request: SearchRequest,
    startTime: number,
  ): Promise<SearchResponse> {
    const fullTextOptions: FullTextSearchOptions = {
      query: request.query!,
      limit: request.pageSize,
      offset: (request.page - 1) * request.pageSize,
      libraryId: request.filters?.libraryIds?.[0], // 取第一个图书馆ID
      userId: request.userId,
    };

    const fullTextResult = await this.fullTextSearchService.searchBooks(fullTextOptions);

    // 获取聚合数据（基于过滤条件）
    const whereClause = this.buildWhereClause(request);
    const aggregations = await this.getAggregations(whereClause);

    return {
      results: fullTextResult.books.map(result => this.mapFullTextToSearchResult(result)),
      totalCount: fullTextResult.total,
      page: request.page,
      pageSize: request.pageSize,
      totalPages: Math.ceil(fullTextResult.total / request.pageSize),
      aggregations,
      searchTime: Date.now() - startTime,
    };
  }

  private async performTraditionalSearch(
    request: SearchRequest,
    startTime: number,
  ): Promise<SearchResponse> {
    // 构建搜索查询
    const whereClause = this.buildWhereClause(request);
    const orderBy = this.buildOrderBy(request.sort);

    // 执行搜索
    const [books, totalCount] = await Promise.all([
      this.prisma.book.findMany({
        where: whereClause,
        orderBy,
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
        include: {
          library: {
            select: { id: true, name: true },
          },
          shelf: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.book.count({ where: whereClause }),
    ]);

    // 获取聚合数据
    const aggregations = await this.getAggregations(whereClause);

    const response: SearchResponse = {
      results: books.map(book => this.mapToSearchResult(book)),
      totalCount,
      page: request.page,
      pageSize: request.pageSize,
      totalPages: Math.ceil(totalCount / request.pageSize),
      aggregations,
      searchTime: Date.now() - startTime,
    };

    // 缓存结果（5分钟）
    await this.redis.set(this.generateCacheKey(request), JSON.stringify(response), 300);

    return response;
  }

  async getSuggestions(query: string, libraryIds?: number[]): Promise<SearchSuggestion[]> {
    const cacheKey = `suggestions:${query}:${libraryIds?.join(',') || 'all'}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 使用全文搜索服务获取建议
    const suggestions = await this.fullTextSearchService.getSearchSuggestions(query, 10);

    const result: SearchSuggestion[] = suggestions.map(suggestion => ({
      text: suggestion,
      type: 'title' as const, // 默认类型，可以根据需要扩展
    }));

    // 缓存建议（10分钟）
    await this.redis.set(cacheKey, JSON.stringify(result), 600);

    return result;
  }

  private buildWhereClause(request: SearchRequest): Prisma.BookWhereInput {
    const conditions: Prisma.BookWhereInput[] = [];

    // 基础查询条件
    if (request.query) {
      conditions.push({
        OR: [
          { title: { contains: request.query, mode: 'insensitive' } },
          { author: { contains: request.query, mode: 'insensitive' } },
          { description: { contains: request.query, mode: 'insensitive' } },
          { publisher: { contains: request.query, mode: 'insensitive' } },
          { isbn: { contains: request.query, mode: 'insensitive' } },
        ],
      });
    }

    // 过滤条件
    if (request.filters) {
      if (request.filters.libraryIds?.length) {
        conditions.push({ libraryId: { in: request.filters.libraryIds } });
      }

      if (request.filters.shelfIds?.length) {
        conditions.push({ shelfId: { in: request.filters.shelfIds } });
      }

      if (request.filters.authors?.length) {
        conditions.push({
          author: {
            in: request.filters.authors,
            mode: 'insensitive',
          },
        });
      }

      if (request.filters.publishers?.length) {
        conditions.push({
          publisher: {
            in: request.filters.publishers,
            mode: 'insensitive',
          },
        });
      }

      if (request.filters.languages?.length) {
        conditions.push({ language: { in: request.filters.languages } });
      }

      if (request.filters.fileTypes?.length) {
        conditions.push({ fileType: { in: request.filters.fileTypes } });
      }

      if (request.filters.dateRange) {
        const dateConditions: Prisma.BookWhereInput = {};
        if (request.filters.dateRange.from) {
          dateConditions.publishDate = { gte: request.filters.dateRange.from };
        }
        if (request.filters.dateRange.to) {
          const existingCondition = (dateConditions.publishDate as any) || {};
          dateConditions.publishDate = {
            ...existingCondition,
            lte: request.filters.dateRange.to,
          };
        }
        conditions.push(dateConditions);
      }

      if (request.filters.fileSizeRange) {
        const sizeConditions: Prisma.BookWhereInput = {};
        if (request.filters.fileSizeRange.min) {
          sizeConditions.fileSize = { gte: request.filters.fileSizeRange.min };
        }
        if (request.filters.fileSizeRange.max) {
          const existingCondition = (sizeConditions.fileSize as any) || {};
          sizeConditions.fileSize = {
            ...existingCondition,
            lte: request.filters.fileSizeRange.max,
          };
        }
        conditions.push(sizeConditions);
      }

      if (request.filters.hasMetadata !== undefined) {
        if (request.filters.hasMetadata) {
          conditions.push({ metadata: { not: null } });
        } else {
          conditions.push({ metadata: null });
        }
      }

      if (request.filters.status?.length) {
        conditions.push({ status: { in: request.filters.status as any } });
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildOrderBy(sort?: {
    field: string;
    direction: 'asc' | 'desc';
  }): Prisma.BookOrderByWithRelationInput {
    if (!sort) {
      return { createdAt: 'desc' };
    }

    const orderBy: Prisma.BookOrderByWithRelationInput = {};

    switch (sort.field) {
      case 'title':
        orderBy.title = sort.direction;
        break;
      case 'author':
        orderBy.author = sort.direction;
        break;
      case 'publishDate':
        orderBy.publishDate = sort.direction;
        break;
      case 'fileSize':
        orderBy.fileSize = sort.direction;
        break;
      case 'createdAt':
        orderBy.createdAt = sort.direction;
        break;
      case 'updatedAt':
        orderBy.updatedAt = sort.direction;
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    return orderBy;
  }

  private async getAggregations(whereClause: Prisma.BookWhereInput): Promise<SearchAggregations> {
    const [
      authorCounts,
      publisherCounts,
      languageCounts,
      fileTypeCounts,
      libraryCounts,
      statusCounts,
    ] = await Promise.all([
      this.getFieldAggregation(whereClause, 'author'),
      this.getFieldAggregation(whereClause, 'publisher'),
      this.getFieldAggregation(whereClause, 'language'),
      this.getFieldAggregation(whereClause, 'fileType'),
      this.getLibraryAggregation(whereClause),
      this.getFieldAggregation(whereClause, 'status'),
    ]);

    return {
      authors: authorCounts,
      publishers: publisherCounts,
      languages: languageCounts,
      fileTypes: fileTypeCounts,
      libraries: libraryCounts,
      status: statusCounts,
    };
  }

  private async getFieldAggregation(
    whereClause: Prisma.BookWhereInput,
    field: string,
  ): Promise<Array<{ value: string; count: number }>> {
    try {
      // Use raw query for aggregation to avoid complex type issues
      const results = await this.prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
        SELECT ${Prisma.raw(field)} as value, COUNT(*) as count
        FROM books 
        WHERE ${Prisma.raw(field)} IS NOT NULL
        GROUP BY ${Prisma.raw(field)}
        ORDER BY count DESC
        LIMIT 20
      `;

      return results.map(result => ({
        value: result.value,
        count: Number(result.count),
      }));
    } catch (error) {
      console.error(`Error in getFieldAggregation for field ${field}:`, error);
      return [];
    }
  }

  private async getLibraryAggregation(
    _whereClause: Prisma.BookWhereInput,
  ): Promise<Array<{ value: string; count: number; id: number }>> {
    try {
      const results = await this.prisma.$queryRaw<Array<{ library_id: number; count: bigint }>>`
        SELECT library_id, COUNT(*) as count
        FROM books 
        GROUP BY library_id
        ORDER BY count DESC
      `;

      const libraryIds = results.map(r => r.library_id);
      const libraries = await this.prisma.library.findMany({
        where: { id: { in: libraryIds } },
        select: { id: true, name: true },
      });

      const libraryMap = new Map(libraries.map(lib => [lib.id, lib.name]));

      return results.map(result => ({
        id: result.library_id,
        value: libraryMap.get(result.library_id) || 'Unknown',
        count: Number(result.count),
      }));
    } catch (error) {
      console.error('Error in getLibraryAggregation:', error);
      return [];
    }
  }

  private extractSuggestions(data: any[], field: string, query: string): SearchSuggestion[] {
    const suggestions = new Set<string>();

    data.forEach(item => {
      const value = item[field];
      if (value && typeof value === 'string' && value.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(value);
      }
    });

    return Array.from(suggestions).map(suggestion => ({
      text: suggestion,
      type: field as 'title' | 'author' | 'publisher',
    }));
  }

  private mapToSearchResult(book: any): SearchResult {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      isbn: book.isbn,
      language: book.language,
      fileType: book.fileType,
      fileSize: book.fileSize,
      coverImage: book.coverImagePath,
      description: book.description,
      publishDate: book.publishedDate,
      status: book.status,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      library: {
        id: book.library.id,
        name: book.library.name,
      },
      shelf: book.shelf
        ? {
            id: book.shelf.id,
            name: book.shelf.name,
          }
        : undefined,
      metadata: book.metadata,
    };
  }

  private mapFullTextToSearchResult(result: any): SearchResult {
    return {
      id: result.id,
      title: result.title,
      author: result.author,
      publisher: result.publisher,
      isbn: result.isbn,
      language: result.language,
      fileType: result.fileType,
      fileSize: result.fileSize,
      coverImage: result.coverImage,
      description: result.description,
      publishDate: result.publishDate,
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      library: {
        id: result.library.id,
        name: result.library.name,
      },
      shelf: result.shelf
        ? {
            id: result.shelf.id,
            name: result.shelf.name,
          }
        : undefined,
      metadata: result.metadata,
    };
  }

  private generateCacheKey(request: SearchRequest): string {
    const key = `search:${JSON.stringify({
      query: request.query,
      filters: request.filters,
      sort: request.sort,
      page: request.page,
      pageSize: request.pageSize,
    })}`;

    return Buffer.from(key).toString('base64').substring(0, 250);
  }
}
