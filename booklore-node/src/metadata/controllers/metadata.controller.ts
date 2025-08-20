import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { MetadataService } from '../services/metadata.service';
import { MetadataHistoryService } from '../services/metadata-history.service';
import { MetadataTemplateService } from '../services/metadata-template.service';
import {
  MetadataSearchDto,
  BookMetadataUpdateDto,
  BulkMetadataUpdateDto,
  CreateMetadataTemplateDto,
  UpdateMetadataTemplateDto,
  MetadataRefreshConfigDto,
  MetadataHistoryQueryDto,
  RollbackMetadataDto,
} from '../dto/metadata.dto';

@ApiTags('Metadata')
@Controller('metadata')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MetadataController {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly historyService: MetadataHistoryService,
    private readonly templateService: MetadataTemplateService,
  ) {}

  @Post('search')
  @ApiOperation({ summary: 'Search for metadata across multiple sources' })
  @ApiResponse({ status: 200, description: 'Metadata search results' })
  @Roles(Role.USER)
  async searchMetadata(@Body() searchDto: MetadataSearchDto) {
    return await this.metadataService.searchMetadata(searchDto);
  }

  @Get('isbn/:isbn')
  @ApiOperation({ summary: 'Get metadata by ISBN' })
  @ApiParam({ name: 'isbn', description: 'Book ISBN' })
  @ApiResponse({ status: 200, description: 'Metadata found by ISBN' })
  @Roles(Role.USER)
  async getMetadataByIsbn(@Param('isbn') isbn: string) {
    return await this.metadataService.getMetadataByIsbn(isbn);
  }

  @Put('books/:bookId')
  @ApiOperation({ summary: 'Update book metadata' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Metadata updated successfully' })
  @Roles(Role.USER)
  async updateBookMetadata(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() updateDto: BookMetadataUpdateDto,
    @CurrentUser() user: any,
  ) {
    await this.metadataService.updateBookMetadata(bookId, updateDto, user.id);
    return { message: 'Metadata updated successfully' };
  }

  @Post('books/bulk-update')
  @ApiOperation({ summary: 'Bulk update metadata for multiple books' })
  @ApiResponse({ status: 200, description: 'Bulk update results' })
  @Roles(Role.USER)
  async bulkUpdateMetadata(@Body() bulkUpdateDto: BulkMetadataUpdateDto, @CurrentUser() user: any) {
    return await this.metadataService.bulkUpdateMetadata(bulkUpdateDto, user.id);
  }

  @Post('books/refresh')
  @ApiOperation({ summary: 'Refresh metadata for books' })
  @ApiResponse({ status: 200, description: 'Metadata refresh results' })
  @Roles(Role.USER)
  async refreshMetadata(
    @Body() body: { bookIds: number[]; config: MetadataRefreshConfigDto },
    @CurrentUser() user: any,
  ) {
    return await this.metadataService.refreshMetadata(body.bookIds, body.config, user.id);
  }

  @Get('books/:bookId/enhanced')
  @ApiOperation({ summary: 'Get enhanced metadata for a book' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Enhanced metadata with suggestions' })
  @Roles(Role.USER)
  async getEnhancedMetadata(@Param('bookId', ParseIntPipe) bookId: number) {
    return await this.metadataService.getEnhancedMetadata(bookId);
  }

  @Get('sources/status')
  @ApiOperation({ summary: 'Get status of metadata sources' })
  @ApiResponse({ status: 200, description: 'Metadata sources status' })
  @Roles(Role.USER)
  async getSourceStatus() {
    return await this.metadataService.getSourceStatus();
  }

  // History endpoints
  @Get('history')
  @ApiOperation({ summary: 'Get metadata change history' })
  @ApiResponse({ status: 200, description: 'Metadata change history' })
  @Roles(Role.USER)
  async getHistory(@Query() query: MetadataHistoryQueryDto) {
    return await this.historyService.getHistory(query);
  }

  @Get('books/:bookId/history')
  @ApiOperation({ summary: 'Get metadata history for a specific book' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Book metadata history' })
  @Roles(Role.USER)
  async getBookHistory(@Param('bookId', ParseIntPipe) bookId: number) {
    return await this.historyService.getBookHistory(bookId);
  }

  @Post('history/:historyId/rollback')
  @ApiOperation({ summary: 'Rollback metadata to a specific history point' })
  @ApiParam({ name: 'historyId', description: 'History entry ID' })
  @ApiResponse({ status: 200, description: 'Metadata rolled back successfully' })
  @Roles(Role.USER)
  async rollbackMetadata(
    @Param('historyId', ParseIntPipe) historyId: number,
    @Body() rollbackDto: RollbackMetadataDto,
    @CurrentUser() user: any,
  ) {
    await this.historyService.rollbackToHistory(historyId, user.id, rollbackDto);
    return { message: 'Metadata rolled back successfully' };
  }

  @Get('history/stats')
  @ApiOperation({ summary: 'Get metadata change statistics' })
  @ApiQuery({ name: 'bookId', required: false, description: 'Filter by book ID' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiResponse({ status: 200, description: 'Metadata change statistics' })
  @Roles(Role.USER)
  async getChangeStatistics(@Query('bookId') bookId?: number, @Query('userId') userId?: number) {
    return await this.historyService.getChangeStatistics(bookId, userId);
  }

  // Template endpoints
  @Post('templates')
  @ApiOperation({ summary: 'Create a new metadata template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @Roles(Role.USER)
  async createTemplate(@Body() createDto: CreateMetadataTemplateDto, @CurrentUser() user: any) {
    return await this.templateService.createTemplate(user.id, createDto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get all accessible metadata templates' })
  @ApiQuery({ name: 'includePublic', required: false, description: 'Include public templates' })
  @ApiResponse({ status: 200, description: 'List of metadata templates' })
  @Roles(Role.USER)
  async getTemplates(
    @CurrentUser() user: any,
    @Query('includePublic') includePublic: boolean = true,
  ) {
    return await this.templateService.getTemplates(user.id, includePublic);
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Get a specific metadata template' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 200, description: 'Metadata template details' })
  @Roles(Role.USER)
  async getTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: any,
  ) {
    return await this.templateService.getTemplate(templateId, user.id);
  }

  @Put('templates/:templateId')
  @ApiOperation({ summary: 'Update a metadata template' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @Roles(Role.USER)
  async updateTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() updateDto: UpdateMetadataTemplateDto,
    @CurrentUser() user: any,
  ) {
    return await this.templateService.updateTemplate(templateId, user.id, updateDto);
  }

  @Delete('templates/:templateId')
  @ApiOperation({ summary: 'Delete a metadata template' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.USER)
  async deleteTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: any,
  ) {
    await this.templateService.deleteTemplate(templateId, user.id);
  }

  @Post('templates/:templateId/apply')
  @ApiOperation({ summary: 'Apply a template to generate metadata updates' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 200, description: 'Template applied successfully' })
  @Roles(Role.USER)
  async applyTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() baseMetadata: Partial<BookMetadataUpdateDto>,
    @CurrentUser() user: any,
  ) {
    const convertedMetadata: any = { ...baseMetadata };
    if (convertedMetadata.publishDate) {
      convertedMetadata.publishDate = new Date(convertedMetadata.publishDate);
    }
    return await this.templateService.applyTemplate(templateId, convertedMetadata, user.id);
  }

  @Post('templates/:templateId/apply-to-books')
  @ApiOperation({ summary: 'Apply a template to multiple books' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 200, description: 'Template application results' })
  @Roles(Role.USER)
  async applyTemplateToBooks(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body()
    body: {
      bookIds: number[];
      overrideValues?: Partial<BookMetadataUpdateDto>;
    },
    @CurrentUser() user: any,
  ) {
    let convertedOverrides: any = body.overrideValues;
    if (convertedOverrides?.publishDate) {
      convertedOverrides = { ...convertedOverrides };
      convertedOverrides.publishDate = new Date(convertedOverrides.publishDate);
    }
    return await this.templateService.applyTemplateToBooks(
      templateId,
      body.bookIds,
      user.id,
      convertedOverrides,
    );
  }

  @Post('templates/from-book/:bookId')
  @ApiOperation({ summary: 'Create a template from existing book metadata' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  @ApiResponse({ status: 201, description: 'Template created from book' })
  @Roles(Role.USER)
  async createTemplateFromBook(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body()
    body: {
      templateName: string;
      templateDescription: string;
      isPublic?: boolean;
    },
    @CurrentUser() user: any,
  ) {
    return await this.templateService.createTemplateFromBook(
      bookId,
      body.templateName,
      body.templateDescription,
      user.id,
      body.isPublic || false,
    );
  }

  @Get('templates/:templateId/stats')
  @ApiOperation({ summary: 'Get template usage statistics' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @ApiResponse({ status: 200, description: 'Template usage statistics' })
  @Roles(Role.USER)
  async getTemplateStats(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: any,
  ) {
    return await this.templateService.getTemplateStats(templateId, user.id);
  }

  // Admin endpoints
  @Delete('history/cleanup')
  @ApiOperation({ summary: 'Clean up old metadata history entries' })
  @ApiQuery({
    name: 'olderThanDays',
    required: false,
    description: 'Delete entries older than X days',
  })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  @Roles(Role.ADMIN)
  async cleanupHistory(@Query('olderThanDays') olderThanDays: number = 365) {
    const deletedCount = await this.historyService.cleanupOldHistory(olderThanDays);
    return { message: `Cleaned up ${deletedCount} old history entries` };
  }
}
