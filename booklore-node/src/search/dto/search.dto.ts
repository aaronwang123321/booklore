import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SearchQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '页码', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页大小', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    description: '排序字段',
    enum: ['title', 'author', 'publishDate', 'fileSize', 'createdAt', 'updatedAt'],
  })
  @IsOptional()
  @IsString()
  @IsEnum(['title', 'author', 'publishDate', 'fileSize', 'createdAt', 'updatedAt'])
  sort?: string;

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsEnum(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: '图书馆ID列表', type: [Number] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : [Number(value)]))
  @IsArray()
  @IsNumber({}, { each: true })
  libraryIds?: number[];

  @ApiPropertyOptional({ description: '书架ID列表', type: [Number] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : [Number(value)]))
  @IsArray()
  @IsNumber({}, { each: true })
  shelfIds?: number[];

  @ApiPropertyOptional({ description: '作者列表', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  authors?: string[];

  @ApiPropertyOptional({ description: '出版社列表', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  publishers?: string[];

  @ApiPropertyOptional({ description: '语言列表', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ description: '文件类型列表', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  fileTypes?: string[];

  @ApiPropertyOptional({ description: '状态列表', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  dateFrom?: Date;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  dateTo?: Date;

  @ApiPropertyOptional({ description: '最小文件大小（字节）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fileSizeMin?: number;

  @ApiPropertyOptional({ description: '最大文件大小（字节）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fileSizeMax?: number;

  @ApiPropertyOptional({ description: '是否有元数据' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasMetadata?: boolean;
}

export class SearchSuggestionQueryDto {
  @ApiProperty({ description: '搜索关键词' })
  @IsString()
  q: string;

  @ApiPropertyOptional({ description: '图书馆ID列表', type: [Number] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : [Number(value)]))
  @IsArray()
  @IsNumber({}, { each: true })
  libraryIds?: number[];
}

export class SearchResultDto {
  @ApiProperty({ description: '图书ID' })
  id: number;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiPropertyOptional({ description: '作者' })
  author?: string;

  @ApiPropertyOptional({ description: 'ISBN' })
  isbn?: string;

  @ApiPropertyOptional({ description: '语言' })
  language?: string;

  @ApiPropertyOptional({ description: '出版社' })
  publisher?: string;

  @ApiPropertyOptional({ description: '出版日期' })
  publishDate?: Date;

  @ApiPropertyOptional({ description: '描述' })
  description?: string;

  @ApiProperty({ description: '文件类型' })
  fileType: string;

  @ApiProperty({ description: '文件大小' })
  fileSize: number;

  @ApiPropertyOptional({ description: '封面图片' })
  coverImage?: string;

  @ApiProperty({ description: '状态' })
  status: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiProperty({ description: '图书馆信息' })
  library: {
    id: number;
    name: string;
  };

  @ApiPropertyOptional({ description: '书架信息' })
  shelf?: {
    id: number;
    name: string;
  };

  @ApiPropertyOptional({ description: '元数据' })
  metadata?: any;
}

export class SearchAggregationDto {
  @ApiProperty({ description: '值' })
  value: string;

  @ApiProperty({ description: '数量' })
  count: number;

  @ApiPropertyOptional({ description: 'ID（用于图书馆聚合）' })
  id?: number;
}

export class SearchAggregationsDto {
  @ApiProperty({ description: '作者聚合', type: [SearchAggregationDto] })
  authors: SearchAggregationDto[];

  @ApiProperty({ description: '出版社聚合', type: [SearchAggregationDto] })
  publishers: SearchAggregationDto[];

  @ApiProperty({ description: '语言聚合', type: [SearchAggregationDto] })
  languages: SearchAggregationDto[];

  @ApiProperty({ description: '文件类型聚合', type: [SearchAggregationDto] })
  fileTypes: SearchAggregationDto[];

  @ApiProperty({ description: '图书馆聚合', type: [SearchAggregationDto] })
  libraries: SearchAggregationDto[];

  @ApiProperty({ description: '状态聚合', type: [SearchAggregationDto] })
  status: SearchAggregationDto[];
}

export class SearchResponseDto {
  @ApiProperty({ description: '搜索结果', type: [SearchResultDto] })
  results: SearchResultDto[];

  @ApiProperty({ description: '总数量' })
  totalCount: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页大小' })
  pageSize: number;

  @ApiProperty({ description: '总页数' })
  totalPages: number;

  @ApiProperty({ description: '聚合数据', type: SearchAggregationsDto })
  aggregations: SearchAggregationsDto;

  @ApiProperty({ description: '搜索耗时（毫秒）' })
  searchTime: number;
}

export class SearchSuggestionDto {
  @ApiProperty({ description: '建议文本' })
  text: string;

  @ApiProperty({ description: '建议类型', enum: ['title', 'author', 'publisher'] })
  type: 'title' | 'author' | 'publisher';
}

export class SearchSuggestionResponseDto {
  @ApiProperty({ description: '搜索建议', type: [SearchSuggestionDto] })
  suggestions: SearchSuggestionDto[];
}
