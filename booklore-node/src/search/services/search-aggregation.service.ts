import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  AggregationRequest,
  AggregationResponse,
  AggregationBucket,
  DateHistogramAggregation,
  TermsAggregation,
  RangeAggregation,
  StatsAggregation,
} from '../interfaces/search.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchAggregationService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async performAggregation(request: AggregationRequest): Promise<AggregationResponse> {
    const cacheKey = this.generateAggregationCacheKey(request);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const whereClause = request.filters ? this.buildWhereClause(request.filters) : {};
    const aggregations: Record<string, any> = {};

    // 执行各种聚合
    for (const [name, config] of Object.entries(request.aggregations)) {
      switch (config.type) {
        case 'terms':
          aggregations[name] = await this.performTermsAggregation(
            config as TermsAggregation,
            whereClause,
          );
          break;
        case 'date_histogram':
          aggregations[name] = await this.performDateHistogramAggregation(
            config as DateHistogramAggregation,
            whereClause,
          );
          break;
        case 'range':
          aggregations[name] = await this.performRangeAggregation(
            config as RangeAggregation,
            whereClause,
          );
          break;
        case 'stats':
          aggregations[name] = await this.performStatsAggregation(
            config as StatsAggregation,
            whereClause,
          );
          break;
      }
    }

    const response: AggregationResponse = {
      aggregations,
      totalCount: await this.prisma.book.count({ where: whereClause }),
      executionTime: Date.now() - (request.timestamp || Date.now()),
    };

    // 缓存结果（10分钟）
    await this.redis.set(cacheKey, JSON.stringify(response), 600);

    return response;
  }

  private async performTermsAggregation(
    config: TermsAggregation,
    _whereClause: Prisma.BookWhereInput,
  ): Promise<{ buckets: AggregationBucket[] }> {
    try {
      // Use raw query to avoid complex type issues
      const results = await this.prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
        SELECT ${Prisma.raw(config.field)} as value, COUNT(*) as count
        FROM books 
        WHERE ${Prisma.raw(config.field)} IS NOT NULL
        GROUP BY ${Prisma.raw(config.field)}
        ORDER BY count ${Prisma.raw(config.order === 'asc' ? 'ASC' : 'DESC')}
        LIMIT ${config.size || 10}
      `;

      const buckets: AggregationBucket[] = results.map(result => ({
        key: result.value,
        doc_count: Number(result.count),
        key_as_string: this.formatBucketKey(config.field, result.value),
      }));

      return { buckets };
    } catch (error) {
      console.error('Error in performTermsAggregation:', error);
      return { buckets: [] };
    }
  }

  private async performDateHistogramAggregation(
    config: DateHistogramAggregation,
    whereClause: Prisma.BookWhereInput,
  ): Promise<{ buckets: AggregationBucket[] }> {
    // 根据间隔类型构建日期分组查询
    const interval = config.calendar_interval || config.fixed_interval || 'month';

    // 这里需要使用原生SQL来实现日期直方图
    const query = this.buildDateHistogramQuery(config.field, interval, whereClause);
    const results = await this.prisma.$queryRaw<any[]>(query);

    const buckets: AggregationBucket[] = results.map(result => ({
      key: result.date_key,
      key_as_string: this.formatDateKey(result.date_key, interval),
      doc_count: parseInt(result.doc_count),
    }));

    return { buckets };
  }

  private async performRangeAggregation(
    config: RangeAggregation,
    whereClause: Prisma.BookWhereInput,
  ): Promise<{ buckets: AggregationBucket[] }> {
    const buckets: AggregationBucket[] = [];

    for (const range of config.ranges) {
      const rangeWhere: Prisma.BookWhereInput = {
        ...whereClause,
        [config.field]: {
          ...(range.from !== undefined && { gte: range.from }),
          ...(range.to !== undefined && { lt: range.to }),
        },
      };

      const count = await this.prisma.book.count({ where: rangeWhere });

      buckets.push({
        key: range.key || `${range.from || '*'}-${range.to || '*'}`,
        key_as_string: range.key || this.formatRangeKey(range.from, range.to),
        doc_count: count,
        from: range.from,
        to: range.to,
      });
    }

    return { buckets };
  }

  private async performStatsAggregation(
    config: StatsAggregation,
    whereClause: Prisma.BookWhereInput,
  ): Promise<{
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    sum: number | null;
  }> {
    const result = await this.prisma.book.aggregate({
      where: whereClause,
      _count: { [config.field]: true },
      _min: { [config.field]: true },
      _max: { [config.field]: true },
      _avg: { [config.field]: true },
      _sum: { [config.field]: true },
    });

    return {
      count: result._count[config.field as keyof typeof result._count] || 0,
      min: result._min[config.field as keyof typeof result._min] as number | null,
      max: result._max[config.field as keyof typeof result._max] as number | null,
      avg: result._avg[config.field as keyof typeof result._avg] as number | null,
      sum: result._sum[config.field as keyof typeof result._sum] as number | null,
    };
  }

  async getPopularSearchTerms(limit: number = 10): Promise<Array<{ term: string; count: number }>> {
    const cacheKey = `popular_search_terms:${limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 这里需要实现搜索词统计逻辑
    // 可以通过记录用户搜索行为来实现
    const results: Array<{ term: string; count: number }> = [];

    // 缓存1小时
    await this.redis.set(cacheKey, JSON.stringify(results), 3600);

    return results;
  }

  async getSearchTrends(
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<Array<{ date: string; searches: number; unique_users: number }>> {
    const cacheKey = `search_trends:${period}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 这里需要实现搜索趋势统计逻辑
    const results: Array<{ date: string; searches: number; unique_users: number }> = [];

    // 缓存30分钟
    await this.redis.set(cacheKey, JSON.stringify(results), 1800);

    return results;
  }

  async getLibrarySearchStats(libraryId: number): Promise<{
    totalSearches: number;
    uniqueUsers: number;
    topQueries: Array<{ query: string; count: number }>;
    searchesByDay: Array<{ date: string; count: number }>;
  }> {
    const cacheKey = `library_search_stats:${libraryId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 实现图书馆搜索统计
    const stats = {
      totalSearches: 0,
      uniqueUsers: 0,
      topQueries: [],
      searchesByDay: [],
    };

    // 缓存1小时
    await this.redis.set(cacheKey, JSON.stringify(stats), 3600);

    return stats;
  }

  private buildWhereClause(filters: any): Prisma.BookWhereInput {
    // 重用搜索服务中的过滤器构建逻辑
    const conditions: Prisma.BookWhereInput[] = [];

    if (filters.libraryIds?.length) {
      conditions.push({ libraryId: { in: filters.libraryIds } });
    }

    if (filters.authors?.length) {
      conditions.push({ author: { in: filters.authors } });
    }

    if (filters.publishers?.length) {
      conditions.push({ publisher: { in: filters.publishers } });
    }

    if (filters.languages?.length) {
      conditions.push({ language: { in: filters.languages } });
    }

    if (filters.fileTypes?.length) {
      conditions.push({ fileType: { in: filters.fileTypes } });
    }

    if (filters.dateRange) {
      const dateConditions: Prisma.BookWhereInput = {};
      if (filters.dateRange.from) {
        dateConditions.publishDate = { gte: filters.dateRange.from };
      }
      if (filters.dateRange.to) {
        const existingCondition = (dateConditions.publishDate as any) || {};
        dateConditions.publishDate = {
          ...existingCondition,
          lte: filters.dateRange.to,
        };
      }
      conditions.push(dateConditions);
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildDateHistogramQuery(
    field: string,
    interval: string,
    _whereClause: Prisma.BookWhereInput,
  ): Prisma.Sql {
    // 构建日期直方图的原生SQL查询
    let dateFormat: string;

    switch (interval) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'YYYY-"W"WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
      default:
        dateFormat = 'YYYY-MM';
    }

    return Prisma.sql`
      SELECT 
        TO_CHAR(${Prisma.raw(field)}, ${dateFormat}) as date_key,
        COUNT(*) as doc_count
      FROM books 
      WHERE ${Prisma.raw(field)} IS NOT NULL
      GROUP BY TO_CHAR(${Prisma.raw(field)}, ${dateFormat})
      ORDER BY date_key
    `;
  }

  private formatBucketKey(field: string, value: any): string {
    switch (field) {
      case 'fileSize':
        return this.formatFileSize(value);
      case 'publishDate':
        return new Date(value).toLocaleDateString();
      case 'language':
        return this.getLanguageLabel(value);
      case 'fileType':
        return value.toUpperCase();
      default:
        return String(value);
    }
  }

  private formatDateKey(dateKey: string, interval: string): string {
    switch (interval) {
      case 'day':
        return new Date(dateKey).toLocaleDateString();
      case 'week':
        return `${dateKey}周`;
      case 'month':
        return `${dateKey.substring(0, 4)}年${dateKey.substring(5)}月`;
      case 'year':
        return `${dateKey}年`;
      default:
        return dateKey;
    }
  }

  private formatRangeKey(from?: number, to?: number): string {
    if (from === undefined && to === undefined) return '全部';
    if (from === undefined) return `< ${to}`;
    if (to === undefined) return `>= ${from}`;
    return `${from} - ${to}`;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private getLanguageLabel(code: string): string {
    const languageMap: Record<string, string> = {
      zh: '中文',
      en: 'English',
      ja: '日本語',
      ko: '한국어',
      fr: 'Français',
      de: 'Deutsch',
      es: 'Español',
      it: 'Italiano',
      ru: 'Русский',
    };

    return languageMap[code] || code;
  }

  private generateAggregationCacheKey(request: AggregationRequest): string {
    const key = `aggregation:${JSON.stringify({
      aggregations: request.aggregations,
      filters: request.filters,
    })}`;

    return Buffer.from(key).toString('base64').substring(0, 250);
  }
}
