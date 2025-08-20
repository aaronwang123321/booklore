import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SearchService } from '../services/search.service';
import {
  SearchQueryDto,
  SearchSuggestionQueryDto,
  SearchResponseDto,
  SearchSuggestionResponseDto,
} from '../dto/search.dto';
import { SearchRequest } from '../interfaces/search.interface';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: '搜索图书' })
  @ApiResponse({
    status: 200,
    description: '搜索结果',
    type: SearchResponseDto,
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async search(@Query() queryDto: SearchQueryDto, @Request() req: any): Promise<SearchResponseDto> {
    const searchRequest: SearchRequest = {
      query: queryDto.q,
      page: queryDto.page || 1,
      pageSize: Math.min(queryDto.pageSize || 20, 100), // 限制最大页面大小
      sort: queryDto.sort
        ? {
            field: queryDto.sort,
            direction: queryDto.sortDirection || 'desc',
          }
        : undefined,
      filters: {
        libraryIds: queryDto.libraryIds,
        shelfIds: queryDto.shelfIds,
        authors: queryDto.authors,
        publishers: queryDto.publishers,
        languages: queryDto.languages,
        fileTypes: queryDto.fileTypes,
        status: queryDto.status,
        dateRange:
          queryDto.dateFrom || queryDto.dateTo
            ? {
                from: queryDto.dateFrom,
                to: queryDto.dateTo,
              }
            : undefined,
        fileSizeRange:
          queryDto.fileSizeMin || queryDto.fileSizeMax
            ? {
                min: queryDto.fileSizeMin,
                max: queryDto.fileSizeMax,
              }
            : undefined,
        hasMetadata: queryDto.hasMetadata,
      },
      timestamp: Date.now(),
      userId: req.user.id,
    };

    return await this.searchService.search(searchRequest);
  }

  @Get('suggestions')
  @ApiOperation({ summary: '获取搜索建议' })
  @ApiResponse({
    status: 200,
    description: '搜索建议列表',
    type: SearchSuggestionResponseDto,
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getSuggestions(
    @Query() queryDto: SearchSuggestionQueryDto,
    @Request() _req: any,
  ): Promise<SearchSuggestionResponseDto> {
    if (!queryDto.q || queryDto.q.length < 2) {
      return { suggestions: [] };
    }

    const suggestions = await this.searchService.getSuggestions(queryDto.q, queryDto.libraryIds);

    return { suggestions };
  }

  @Get('facets')
  @ApiOperation({ summary: '获取搜索面板数据' })
  @ApiResponse({
    status: 200,
    description: '面板聚合数据',
  })
  async getFacets(@Query('libraryIds') libraryIds?: number[]) {
    // 获取基础聚合数据用于构建搜索面板
    const searchRequest: SearchRequest = {
      query: '',
      page: 1,
      pageSize: 1,
      filters: {
        libraryIds: libraryIds,
      },
      timestamp: Date.now(),
    };

    const result = await this.searchService.search(searchRequest);

    return {
      aggregations: result.aggregations,
      totalBooks: result.totalCount,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取搜索统计信息' })
  @ApiResponse({
    status: 200,
    description: '搜索统计数据',
  })
  async getSearchStats(@Query('libraryIds') libraryIds?: number[]) {
    // 这里可以添加更详细的统计信息
    const searchRequest: SearchRequest = {
      query: '',
      page: 1,
      pageSize: 1,
      filters: {
        libraryIds: libraryIds,
      },
      timestamp: Date.now(),
    };

    const result = await this.searchService.search(searchRequest);

    return {
      totalBooks: result.totalCount,
      aggregations: result.aggregations,
      searchTime: result.searchTime,
    };
  }
}
