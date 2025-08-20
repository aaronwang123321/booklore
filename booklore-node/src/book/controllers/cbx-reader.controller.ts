import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Post,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { CbxReaderService, CbxPageInfo, CbxReaderOptions } from '../services/cbx-reader.service';

export class CbxPageListResponseDto {
  pages: CbxPageInfo[];
  totalPages: number;
}

export class CbxPageInfoResponseDto {
  pageNumber: number;
  totalPages: number;
  fileName: string;
  nextPage?: number;
  previousPage?: number;
}

export class PreloadPagesDto {
  startPage: number;
  endPage: number;
}

@ApiTags('CBX Reader')
@Controller('cbx')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CbxReaderController {
  constructor(private readonly cbxReaderService: CbxReaderService) {}

  @Get('pages')
  @ApiOperation({ summary: 'Get list of all pages in CBX book' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiResponse({
    status: 200,
    description: 'Page list retrieved successfully',
    type: CbxPageListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Book is not CBX format' })
  @ApiResponse({ status: 404, description: 'Book not found or access denied' })
  async getPageList(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() user: User,
  ): Promise<CbxPageListResponseDto> {
    const pages = await this.cbxReaderService.getPageList(bookId, user.id);
    return {
      pages,
      totalPages: pages.length,
    };
  }

  @Get('pages/:pageNumber')
  @ApiOperation({ summary: 'Get information about a specific page' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiParam({ name: 'pageNumber', type: 'number', description: 'Page number (1-based)' })
  @ApiResponse({
    status: 200,
    description: 'Page info retrieved successfully',
    type: CbxPageInfoResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid page number or book format' })
  @ApiResponse({ status: 404, description: 'Book not found or access denied' })
  async getPageInfo(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @CurrentUser() user: User,
  ): Promise<CbxPageInfoResponseDto> {
    return await this.cbxReaderService.getPageInfo(bookId, pageNumber, user.id);
  }

  @Get('pages/:pageNumber/image')
  @ApiOperation({ summary: 'Stream page image with optional optimization' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiParam({ name: 'pageNumber', type: 'number', description: 'Page number (1-based)' })
  @ApiQuery({
    name: 'quality',
    required: false,
    type: 'number',
    description: 'Image quality (1-100)',
    example: 85,
  })
  @ApiQuery({
    name: 'maxWidth',
    required: false,
    type: 'number',
    description: 'Maximum width in pixels',
    example: 1200,
  })
  @ApiQuery({
    name: 'maxHeight',
    required: false,
    type: 'number',
    description: 'Maximum height in pixels',
    example: 1600,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['jpeg', 'png', 'webp'],
    description: 'Output format',
    example: 'jpeg',
  })
  @ApiResponse({ status: 200, description: 'Page image streamed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid page number or parameters' })
  @ApiResponse({ status: 404, description: 'Book or page not found' })
  async streamPageImage(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @CurrentUser() user: User,
    @Res() response: Response,
    @Query('quality', new ParseIntPipe({ optional: true })) quality?: number,
    @Query('maxWidth', new ParseIntPipe({ optional: true })) maxWidth?: number,
    @Query('maxHeight', new ParseIntPipe({ optional: true })) maxHeight?: number,
    @Query('format') format?: 'jpeg' | 'png' | 'webp',
  ): Promise<void> {
    // Validate parameters
    if (quality !== undefined && (quality < 1 || quality > 100)) {
      throw new BadRequestException('Quality must be between 1 and 100');
    }

    if (maxWidth !== undefined && maxWidth < 1) {
      throw new BadRequestException('maxWidth must be greater than 0');
    }

    if (maxHeight !== undefined && maxHeight < 1) {
      throw new BadRequestException('maxHeight must be greater than 0');
    }

    const options: CbxReaderOptions = {};
    if (quality !== undefined) options.quality = quality;
    if (maxWidth !== undefined) options.maxWidth = maxWidth;
    if (maxHeight !== undefined) options.maxHeight = maxHeight;
    if (format !== undefined) options.format = format;

    await this.cbxReaderService.streamPageImage(bookId, pageNumber, user.id, response, options);
  }

  @Post('preload')
  @ApiOperation({ summary: 'Preload pages for faster access' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Pages preloaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid page range' })
  @ApiResponse({ status: 404, description: 'Book not found or access denied' })
  async preloadPages(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() preloadDto: PreloadPagesDto,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    if (preloadDto.startPage < 1) {
      throw new BadRequestException('startPage must be greater than 0');
    }

    if (preloadDto.endPage < preloadDto.startPage) {
      throw new BadRequestException('endPage must be greater than or equal to startPage');
    }

    // Start preloading in background (don't await)
    this.cbxReaderService
      .preloadPages(bookId, preloadDto.startPage, preloadDto.endPage, user.id)
      .catch(error => {
        // Log error but don't fail the request
        console.error(`Error preloading pages for book ${bookId}:`, error);
      });

    return { message: 'Preloading started' };
  }

  @Get('thumbnail')
  @ApiOperation({ summary: 'Get book thumbnail (first page)' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiQuery({
    name: 'width',
    required: false,
    type: 'number',
    description: 'Thumbnail width',
    example: 200,
  })
  @ApiQuery({
    name: 'height',
    required: false,
    type: 'number',
    description: 'Thumbnail height',
    example: 300,
  })
  @ApiResponse({ status: 200, description: 'Thumbnail streamed successfully' })
  @ApiResponse({ status: 404, description: 'Book not found or access denied' })
  async getThumbnail(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() user: User,
    @Res() response: Response,
    @Query('width', new ParseIntPipe({ optional: true })) width?: number,
    @Query('height', new ParseIntPipe({ optional: true })) height?: number,
  ): Promise<void> {
    const options: CbxReaderOptions = {
      maxWidth: width || 200,
      maxHeight: height || 300,
      quality: 85,
      format: 'jpeg',
    };

    // Get first page as thumbnail
    await this.cbxReaderService.streamPageImage(bookId, 1, user.id, response, options);
  }

  @Post('cache/clear')
  @ApiOperation({ summary: 'Clear cached images for this book' })
  @ApiParam({ name: 'bookId', type: 'number', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  @ApiResponse({ status: 404, description: 'Book not found or access denied' })
  async clearCache(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    // Validate access first
    await this.cbxReaderService.getPageList(bookId, user.id);

    // Clear cache
    await this.cbxReaderService.clearCache(bookId);

    return { message: 'Cache cleared successfully' };
  }
}
