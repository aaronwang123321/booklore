import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PdfReaderService } from './pdf-reader.service';
import {
  PdfMetadataResponseDto,
  PdfPageResponseDto,
  PdfTextResponseDto,
} from './dto/pdf-reader.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('PDF Reader')
@Controller('pdf-reader')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PdfReaderController {
  constructor(private readonly pdfReaderService: PdfReaderService) {}

  @Get(':bookId/metadata')
  @ApiOperation({ summary: 'Get PDF metadata' })
  @ApiParam({
    name: 'bookId',
    description: 'Book ID',
    type: 'number',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'PDF metadata retrieved successfully',
    type: PdfMetadataResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  @ApiResponse({ status: 400, description: 'Invalid book or not a PDF file' })
  async get_pdf_metadata(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() _user: User,
  ): Promise<PdfMetadataResponseDto> {
    return this.pdfReaderService.get_pdf_metadata(bookId);
  }

  @Get(':bookId/pages')
  @ApiOperation({ summary: 'Get available page numbers' })
  @ApiParam({
    name: 'bookId',
    description: 'Book ID',
    type: 'number',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Available page numbers retrieved successfully',
    type: [Number],
    example: [1, 2, 3, 4, 5],
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  @ApiResponse({ status: 400, description: 'Invalid book or not a PDF file' })
  async get_available_pages(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() _user: User,
  ): Promise<number[]> {
    return this.pdfReaderService.get_available_pages(bookId);
  }

  @Get(':bookId/pages/:pageNumber')
  @ApiOperation({ summary: 'Get PDF page as image' })
  @ApiParam({
    name: 'bookId',
    description: 'Book ID',
    type: 'number',
    example: 1,
  })
  @ApiParam({
    name: 'pageNumber',
    description: 'Page number to retrieve',
    type: 'number',
    example: 1,
  })
  @ApiQuery({
    name: 'quality',
    description: 'Image quality (1-100)',
    type: 'number',
    example: 85,
    required: false,
  })
  @ApiQuery({
    name: 'density',
    description: 'Image density/resolution (72-300)',
    type: 'number',
    example: 150,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'PDF page image retrieved successfully',
    type: PdfPageResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book or page not found' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async get_pdf_page(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @CurrentUser() _user: User,
    @Query('quality', ParseIntPipe) quality?: number,
    @Query('density', ParseIntPipe) density?: number,
  ): Promise<PdfPageResponseDto> {
    // Validate query parameters
    if (quality !== undefined && (quality < 1 || quality > 100)) {
      throw new BadRequestException('Quality must be between 1 and 100');
    }
    if (density !== undefined && (density < 72 || density > 300)) {
      throw new BadRequestException('Density must be between 72 and 300');
    }

    return this.pdfReaderService.get_pdf_page(bookId, pageNumber, quality, density);
  }

  @Get(':bookId/pages/:pageNumber/text')
  @ApiOperation({ summary: 'Extract text from PDF page' })
  @ApiParam({
    name: 'bookId',
    description: 'Book ID',
    type: 'number',
    example: 1,
  })
  @ApiParam({
    name: 'pageNumber',
    description: 'Page number to extract text from',
    type: 'number',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Text extracted successfully',
    type: PdfTextResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book or page not found' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async extract_text_from_page(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @CurrentUser() _user: User,
  ): Promise<PdfTextResponseDto> {
    return this.pdfReaderService.extract_text_from_page(bookId, pageNumber);
  }

  @Get(':bookId/validate')
  @ApiOperation({ summary: 'Validate PDF file' })
  @ApiParam({
    name: 'bookId',
    description: 'Book ID',
    type: 'number',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'PDF validation result',
    schema: {
      type: 'object',
      properties: {
        isValid: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async validate_pdf_file(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() _user: User,
  ): Promise<{ isValid: boolean }> {
    const isValid = await this.pdfReaderService.validate_pdf_file(bookId);
    return { isValid };
  }
}
