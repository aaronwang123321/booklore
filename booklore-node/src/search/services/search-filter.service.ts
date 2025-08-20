import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  FilterOptions,
  FilterOption,
  FilterValue,
  FilterGroup,
  AdvancedSearchRequest,
  FilterValidationResult,
} from '../interfaces/search.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchFilterService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getAvailableFilters(libraryIds?: number[]): Promise<FilterOptions> {
    const cacheKey = `filters:${libraryIds?.join(',') || 'all'}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const whereClause = libraryIds ? { libraryId: { in: libraryIds } } : {};

    const [
      authors,
      publishers,
      languages,
      fileTypes,
      libraries,
      shelves,
      dateRange,
      fileSizeRange,
    ] = await Promise.all([
      this.getUniqueValues('author', whereClause),
      this.getUniqueValues('publisher', whereClause),
      this.getUniqueValues('language', whereClause),
      this.getUniqueValues('fileType', whereClause),
      this.getLibraryOptions(libraryIds),
      this.getShelfOptions(libraryIds),
      this.getDateRange(whereClause),
      this.getFileSizeRange(whereClause),
    ]);

    const filterOptions: FilterOptions = {
      authors: authors.map(value => ({ value, label: value })),
      publishers: publishers.map(value => ({ value, label: value })),
      languages: languages.map(value => ({ value, label: this.getLanguageLabel(value) })),
      fileTypes: fileTypes.map(value => ({ value, label: this.getFileTypeLabel(value) })),
      libraries: libraries,
      shelves: shelves,
      dateRange,
      fileSizeRange,
      status: [
        { value: 'PROCESSING', label: '处理中' },
        { value: 'COMPLETED', label: '已完成' },
        { value: 'FAILED', label: '处理失败' },
      ],
    };

    // 缓存15分钟
    await this.redis.set(cacheKey, JSON.stringify(filterOptions), 900);

    return filterOptions;
  }

  async validateFilters(filters: any): Promise<FilterValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证图书馆ID
    if (filters.libraryIds?.length) {
      const validLibraries = await this.prisma.library.findMany({
        where: { id: { in: filters.libraryIds } },
        select: { id: true },
      });

      const validIds = validLibraries.map(lib => lib.id);
      const invalidIds = filters.libraryIds.filter((id: number) => !validIds.includes(id));

      if (invalidIds.length > 0) {
        errors.push(`无效的图书馆ID: ${invalidIds.join(', ')}`);
      }
    }

    // 验证书架ID
    if (filters.shelfIds?.length) {
      const validShelves = await this.prisma.shelf.findMany({
        where: { id: { in: filters.shelfIds } },
        select: { id: true },
      });

      const validIds = validShelves.map(shelf => shelf.id);
      const invalidIds = filters.shelfIds.filter((id: number) => !validIds.includes(id));

      if (invalidIds.length > 0) {
        errors.push(`无效的书架ID: ${invalidIds.join(', ')}`);
      }
    }

    // 验证日期范围
    if (filters.dateRange) {
      const { from, to } = filters.dateRange;
      if (from && to && new Date(from) > new Date(to)) {
        errors.push('开始日期不能晚于结束日期');
      }
    }

    // 验证文件大小范围
    if (filters.fileSizeRange) {
      const { min, max } = filters.fileSizeRange;
      if (min && max && min > max) {
        errors.push('最小文件大小不能大于最大文件大小');
      }
      if (min && min < 0) {
        errors.push('文件大小不能为负数');
      }
    }

    // 验证文件类型
    if (filters.fileTypes?.length) {
      const supportedTypes = ['epub', 'pdf', 'cbz', 'cbr', 'mobi', 'azw3'];
      const invalidTypes = filters.fileTypes.filter(
        (type: string) => !supportedTypes.includes(type.toLowerCase()),
      );

      if (invalidTypes.length > 0) {
        warnings.push(`不支持的文件类型: ${invalidTypes.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async buildAdvancedQuery(request: AdvancedSearchRequest): Promise<Prisma.BookWhereInput> {
    const conditions: Prisma.BookWhereInput[] = [];

    // 处理过滤器组
    if (request.filterGroups?.length) {
      for (const group of request.filterGroups) {
        const groupCondition = await this.buildFilterGroupCondition(group);
        if (groupCondition) {
          conditions.push(groupCondition);
        }
      }
    }

    // 处理全文搜索
    if (request.fullTextSearch) {
      conditions.push(this.buildFullTextSearchCondition(request.fullTextSearch));
    }

    // 处理元数据搜索
    if (request.metadataSearch) {
      conditions.push(this.buildMetadataSearchCondition(request.metadataSearch));
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private async buildFilterGroupCondition(
    group: FilterGroup,
  ): Promise<Prisma.BookWhereInput | null> {
    if (!group.filters?.length) return null;

    const groupConditions: Prisma.BookWhereInput[] = [];

    for (const filter of group.filters) {
      const condition = this.buildSingleFilterCondition(filter);
      if (condition) {
        groupConditions.push(condition);
      }
    }

    if (groupConditions.length === 0) return null;

    return group.operator === 'OR' ? { OR: groupConditions } : { AND: groupConditions };
  }

  private buildSingleFilterCondition(filter: FilterValue): Prisma.BookWhereInput | null {
    switch (filter.field) {
      case 'title':
        return this.buildTextFilter('title', filter);
      case 'author':
        return this.buildTextFilter('author', filter);
      case 'publisher':
        return this.buildTextFilter('publisher', filter);
      case 'isbn':
        return this.buildTextFilter('isbn', filter);
      case 'language':
        return this.buildExactFilter('language', filter);
      case 'fileType':
        return this.buildExactFilter('fileType', filter);
      case 'publishDate':
        return this.buildDateFilter('publishDate', filter);
      case 'fileSize':
        return this.buildNumberFilter('fileSize', filter);
      case 'libraryId':
        return this.buildExactFilter('libraryId', filter);
      case 'shelfId':
        return this.buildExactFilter('shelfId', filter);
      case 'status':
        return this.buildExactFilter('status', filter);
      default:
        return null;
    }
  }

  private buildTextFilter(field: string, filter: FilterValue): Prisma.BookWhereInput {
    const condition: any = {};

    switch (filter.operator) {
      case 'contains':
        condition[field] = { contains: filter.value, mode: 'insensitive' };
        break;
      case 'equals':
        condition[field] = { equals: filter.value, mode: 'insensitive' };
        break;
      case 'startsWith':
        condition[field] = { startsWith: filter.value, mode: 'insensitive' };
        break;
      case 'endsWith':
        condition[field] = { endsWith: filter.value, mode: 'insensitive' };
        break;
      case 'not':
        condition[field] = { not: { contains: filter.value, mode: 'insensitive' } };
        break;
      default:
        condition[field] = { contains: filter.value, mode: 'insensitive' };
    }

    return condition;
  }

  private buildExactFilter(field: string, filter: FilterValue): Prisma.BookWhereInput {
    const condition: any = {};

    switch (filter.operator) {
      case 'equals':
        condition[field] = filter.value;
        break;
      case 'in':
        condition[field] = { in: Array.isArray(filter.value) ? filter.value : [filter.value] };
        break;
      case 'not':
        condition[field] = { not: filter.value };
        break;
      case 'notIn':
        condition[field] = { notIn: Array.isArray(filter.value) ? filter.value : [filter.value] };
        break;
      default:
        condition[field] = filter.value;
    }

    return condition;
  }

  private buildDateFilter(field: string, filter: FilterValue): Prisma.BookWhereInput {
    const condition: any = {};
    const date = new Date(filter.value);

    switch (filter.operator) {
      case 'equals':
        condition[field] = date;
        break;
      case 'gt':
        condition[field] = { gt: date };
        break;
      case 'gte':
        condition[field] = { gte: date };
        break;
      case 'lt':
        condition[field] = { lt: date };
        break;
      case 'lte':
        condition[field] = { lte: date };
        break;
      case 'between':
        if (Array.isArray(filter.value) && filter.value.length === 2) {
          condition[field] = {
            gte: new Date(filter.value[0]),
            lte: new Date(filter.value[1]),
          };
        }
        break;
      default:
        condition[field] = date;
    }

    return condition;
  }

  private buildNumberFilter(field: string, filter: FilterValue): Prisma.BookWhereInput {
    const condition: any = {};
    const value = Number(filter.value);

    switch (filter.operator) {
      case 'equals':
        condition[field] = value;
        break;
      case 'gt':
        condition[field] = { gt: value };
        break;
      case 'gte':
        condition[field] = { gte: value };
        break;
      case 'lt':
        condition[field] = { lt: value };
        break;
      case 'lte':
        condition[field] = { lte: value };
        break;
      case 'between':
        if (Array.isArray(filter.value) && filter.value.length === 2) {
          condition[field] = {
            gte: Number(filter.value[0]),
            lte: Number(filter.value[1]),
          };
        }
        break;
      default:
        condition[field] = value;
    }

    return condition;
  }

  private buildFullTextSearchCondition(searchText: string): Prisma.BookWhereInput {
    return {
      OR: [
        { title: { contains: searchText, mode: 'insensitive' } },
        { author: { contains: searchText, mode: 'insensitive' } },
        { description: { contains: searchText, mode: 'insensitive' } },
        { publisher: { contains: searchText, mode: 'insensitive' } },
        { isbn: { contains: searchText, mode: 'insensitive' } },
      ],
    };
  }

  private buildMetadataSearchCondition(metadataQuery: any): Prisma.BookWhereInput {
    // 这里可以实现更复杂的元数据搜索逻辑
    // 例如搜索JSON字段中的特定值
    return {
      metadata: {
        path: Object.keys(metadataQuery),
        string_contains: Object.values(metadataQuery)[0] as string,
      },
    };
  }

  private async getUniqueValues(
    field: string,
    whereClause: Prisma.BookWhereInput,
  ): Promise<string[]> {
    const results = await this.prisma.book.findMany({
      where: {
        ...whereClause,
        [field]: { not: null },
      },
      select: { [field]: true },
      distinct: [field as any],
      take: 100,
    });

    return results
      .map(result => {
        const value = result[field as keyof typeof result];
        return typeof value === 'string' ? value : String(value);
      })
      .filter(Boolean)
      .sort();
  }

  private async getLibraryOptions(libraryIds?: number[]): Promise<FilterOption[]> {
    const libraries = await this.prisma.library.findMany({
      where: libraryIds ? { id: { in: libraryIds } } : {},
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return libraries.map(lib => ({
      value: lib.id.toString(),
      label: lib.name,
    }));
  }

  private async getShelfOptions(libraryIds?: number[]): Promise<FilterOption[]> {
    const shelves = await this.prisma.shelf.findMany({
      where: libraryIds ? { libraryId: { in: libraryIds } } : {},
      select: { id: true, name: true, library: { select: { name: true } } },
      orderBy: [{ library: { name: 'asc' } }, { name: 'asc' }],
    });

    return shelves.map(shelf => ({
      value: shelf.id.toString(),
      label: `${shelf.library.name} - ${shelf.name}`,
    }));
  }

  private async getDateRange(
    whereClause: Prisma.BookWhereInput,
  ): Promise<{ min: Date; max: Date } | null> {
    const result = await this.prisma.book.aggregate({
      where: {
        ...whereClause,
        publishDate: { not: null },
      },
      _min: { publishDate: true },
      _max: { publishDate: true },
    });

    if (!result._min.publishDate || !result._max.publishDate) {
      return null;
    }

    return {
      min: result._min.publishDate,
      max: result._max.publishDate,
    };
  }

  private async getFileSizeRange(
    whereClause: Prisma.BookWhereInput,
  ): Promise<{ min: number; max: number } | null> {
    const result = await this.prisma.book.aggregate({
      where: whereClause,
      _min: { fileSize: true },
      _max: { fileSize: true },
    });

    if (!result._min.fileSize || !result._max.fileSize) {
      return null;
    }

    return {
      min: result._min.fileSize,
      max: result._max.fileSize,
    };
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

  private getFileTypeLabel(type: string): string {
    const typeMap: Record<string, string> = {
      epub: 'EPUB',
      pdf: 'PDF',
      cbz: 'CBZ (漫画)',
      cbr: 'CBR (漫画)',
      mobi: 'MOBI',
      azw3: 'AZW3',
    };

    return typeMap[type.toLowerCase()] || type.toUpperCase();
  }
}
