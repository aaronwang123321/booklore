import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ParseIntPipe,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { OpdsService } from '../services/opds.service';
import { OpdsAuthService } from '../services/opds-auth.service';
import { OpdsSearchDto } from '../dto/opds.dto';

@Controller('opds')
export class OpdsController {
  constructor(
    private opdsService: OpdsService,
    private opdsAuthService: OpdsAuthService,
  ) {}

  /**
   * Root OPDS catalog
   */
  @Get('catalog')
  @Header('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=navigation')
  async getCatalog(@Req() req: Request): Promise<string> {
    const user = await this.authenticateRequest(req);
    const baseUrl = this.getBaseUrl(req);

    return await this.opdsService.generateRootCatalog(user.userId, baseUrl);
  }

  /**
   * Library catalog
   */
  @Get('libraries/:libraryId')
  @Header('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=navigation')
  async getLibraryCatalog(
    @Param('libraryId', ParseIntPipe) libraryId: number,
    @Req() req: Request,
  ): Promise<string> {
    const user = await this.authenticateRequest(req);
    const baseUrl = this.getBaseUrl(req);

    return await this.opdsService.generateLibraryCatalog(libraryId, user.userId, baseUrl);
  }

  /**
   * Library books
   */
  @Get('libraries/:libraryId/books')
  @Header('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition')
  async getLibraryBooks(
    @Param('libraryId', ParseIntPipe) libraryId: number,
    @Req() req: Request,
  ): Promise<string> {
    const user = await this.authenticateRequest(req);
    const baseUrl = this.getBaseUrl(req);

    return await this.opdsService.generateLibraryBooks(libraryId, user.userId, baseUrl);
  }

  /**
   * Shelf books
   */
  @Get('libraries/:libraryId/shelves/:shelfId')
  @Header('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition')
  async getShelfBooks(
    @Param('libraryId', ParseIntPipe) libraryId: number,
    @Param('shelfId', ParseIntPipe) shelfId: number,
    @Req() req: Request,
  ): Promise<string> {
    const user = await this.authenticateRequest(req);
    const baseUrl = this.getBaseUrl(req);

    return await this.opdsService.generateShelfBooks(libraryId, shelfId, user.userId, baseUrl);
  }

  /**
   * Search books
   */
  @Get('search')
  @Header('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition')
  async searchBooks(@Query() searchDto: OpdsSearchDto, @Req() req: Request): Promise<string> {
    const user = await this.authenticateRequest(req);
    const baseUrl = this.getBaseUrl(req);

    return await this.opdsService.searchBooks(searchDto, user.userId, baseUrl);
  }

  /**
   * OpenSearch description
   */
  @Get('search.xml')
  @Header('Content-Type', 'application/opensearchdescription+xml')
  getOpenSearchDescription(@Req() req: Request): string {
    const baseUrl = this.getBaseUrl(req);
    return this.opdsService.generateOpenSearchDescription(baseUrl);
  }

  /**
   * Download book
   */
  @Get('books/:bookId/download')
  async downloadBook(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const user = await this.authenticateRequest(req);

    const bookInfo = await this.opdsService.getBookDownload(bookId, user.userId);

    // Set response headers
    res.set({
      'Content-Type': bookInfo.mimeType,
      'Content-Disposition': `attachment; filename="${bookInfo.fileName}"`,
      'Content-Length': bookInfo.fileSize.toString(),
    });

    // Create and return stream
    const file = createReadStream(bookInfo.filePath);
    return new StreamableFile(file);
  }

  /**
   * Authenticate OPDS request using HTTP Basic Auth
   */
  private async authenticateRequest(req: Request): Promise<any> {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authentication required', 'Basic realm="OPDS"');
    }

    const credentials = this.opdsAuthService.parseBasicAuthHeader(authHeader);
    if (!credentials) {
      throw new UnauthorizedException('Invalid authentication format', 'Basic realm="OPDS"');
    }

    try {
      return await this.opdsAuthService.validateBasicAuth(credentials);
    } catch (error) {
      throw new UnauthorizedException('Invalid credentials', 'Basic realm="OPDS"');
    }
  }

  /**
   * Get base URL from request
   */
  private getBaseUrl(req: Request): string {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}`;
  }
}
