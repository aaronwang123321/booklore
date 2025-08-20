import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as sharp from 'sharp';
import { RedisService } from '../../shared/redis/redis.service';
import { Response } from 'express';

export interface CbxPageInfo {
  pageNumber: number;
  totalPages: number;
  fileName: string;
  nextPage?: number;
  previousPage?: number;
}

export interface CbxReaderOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

@Injectable()
export class CbxReaderService {
  private readonly logger = new Logger(CbxReaderService.name);
  private readonly defaultOptions: CbxReaderOptions = {
    quality: 85,
    maxWidth: 1200,
    maxHeight: 1600,
    format: 'jpeg',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPageList(bookId: number, userId: number): Promise<CbxPageInfo[]> {
    const book = await this.validateBookAccess(bookId, userId);

    if (!['cbz', 'cbr', 'cb7'].includes(book.fileType)) {
      throw new BadRequestException('Book is not a CBX format');
    }

    const metadata = book.metadata as any;
    if (!metadata?.pages || !Array.isArray(metadata.pages)) {
      throw new BadRequestException('CBX metadata is invalid or missing');
    }

    return metadata.pages.map((fileName: string, index: number) => ({
      pageNumber: index + 1,
      totalPages: metadata.pages.length,
      fileName,
      nextPage: index + 1 < metadata.pages.length ? index + 2 : undefined,
      previousPage: index > 0 ? index : undefined,
    }));
  }

  async getPageInfo(bookId: number, pageNumber: number, userId: number): Promise<CbxPageInfo> {
    const book = await this.validateBookAccess(bookId, userId);

    if (!['cbz', 'cbr', 'cb7'].includes(book.fileType)) {
      throw new BadRequestException('Book is not a CBX format');
    }

    const metadata = book.metadata as any;
    if (!metadata?.pages || !Array.isArray(metadata.pages)) {
      throw new BadRequestException('CBX metadata is invalid or missing');
    }

    if (pageNumber < 1 || pageNumber > metadata.pages.length) {
      throw new BadRequestException(
        `Page number ${pageNumber} is out of range (1-${metadata.pages.length})`,
      );
    }

    const pageIndex = pageNumber - 1;
    return {
      pageNumber,
      totalPages: metadata.pages.length,
      fileName: metadata.pages[pageIndex],
      nextPage: pageNumber < metadata.pages.length ? pageNumber + 1 : undefined,
      previousPage: pageNumber > 1 ? pageNumber - 1 : undefined,
    };
  }

  async streamPageImage(
    bookId: number,
    pageNumber: number,
    userId: number,
    response: Response,
    options: CbxReaderOptions = {},
  ): Promise<void> {
    const book = await this.validateBookAccess(bookId, userId);
    const pageInfo = await this.getPageInfo(bookId, pageNumber, userId);

    // Merge options with defaults
    const readerOptions = { ...this.defaultOptions, ...options };

    // Generate cache key
    const cacheKey = this.generateCacheKey(bookId, pageNumber, readerOptions);

    try {
      // Try to get from cache first
      const cachedImage = await this.getCachedImage(cacheKey);
      if (cachedImage) {
        this.logger.debug(`Serving cached image for book ${bookId}, page ${pageNumber}`);
        this.setImageHeaders(response, readerOptions.format!);
        response.send(cachedImage);
        return;
      }

      // Extract and process image
      const imageBuffer = await this.extractPageImage(book.filePath, pageInfo.fileName);
      const processedImage = await this.processImage(imageBuffer, readerOptions);

      // Cache the processed image
      await this.cacheImage(cacheKey, processedImage);

      // Send response
      this.setImageHeaders(response, readerOptions.format!);
      response.send(processedImage);
    } catch (error) {
      this.logger.error(
        `Error streaming page image for book ${bookId}, page ${pageNumber}:`,
        error,
      );
      throw new BadRequestException(`Failed to load page image: ${error.message}`);
    }
  }

  async preloadPages(
    bookId: number,
    startPage: number,
    endPage: number,
    userId: number,
  ): Promise<void> {
    const book = await this.validateBookAccess(bookId, userId);
    const pageList = await this.getPageList(bookId, userId);

    const validStartPage = Math.max(1, startPage);
    const validEndPage = Math.min(pageList.length, endPage);

    this.logger.log(`Preloading pages ${validStartPage}-${validEndPage} for book ${bookId}`);

    // Process pages in parallel but limit concurrency
    const concurrency = 3;
    const promises: Promise<void>[] = [];

    for (let page = validStartPage; page <= validEndPage; page++) {
      const promise = this.preloadSinglePage(
        bookId,
        page,
        book.filePath,
        pageList[page - 1].fileName,
      );
      promises.push(promise);

      // Limit concurrency
      if (promises.length >= concurrency) {
        await Promise.allSettled(promises.splice(0, concurrency));
      }
    }

    // Wait for remaining promises
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    this.logger.log(
      `Completed preloading pages ${validStartPage}-${validEndPage} for book ${bookId}`,
    );
  }

  private async preloadSinglePage(
    bookId: number,
    pageNumber: number,
    filePath: string,
    fileName: string,
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(bookId, pageNumber, this.defaultOptions);

      // Check if already cached
      const cached = await this.getCachedImage(cacheKey);
      if (cached) {
        return;
      }

      // Extract and process image
      const imageBuffer = await this.extractPageImage(filePath, fileName);
      const processedImage = await this.processImage(imageBuffer, this.defaultOptions);

      // Cache the processed image
      await this.cacheImage(cacheKey, processedImage);
    } catch (error) {
      this.logger.warn(`Failed to preload page ${pageNumber} for book ${bookId}:`, error.message);
    }
  }

  private async validateBookAccess(bookId: number, userId: number) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        library: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      },
      include: {
        library: true,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found or access denied');
    }

    if (!fs.existsSync(book.filePath)) {
      throw new NotFoundException('Book file not found on disk');
    }

    return book;
  }

  private async extractPageImage(filePath: string, fileName: string): Promise<Buffer> {
    const fileExtension = path.extname(filePath).toLowerCase();

    switch (fileExtension) {
      case '.cbz':
        return this.extractFromZip(filePath, fileName);
      case '.cbr':
        throw new BadRequestException('RAR format not supported yet');
      case '.cb7':
        throw new BadRequestException('7Z format not supported yet');
      default:
        throw new BadRequestException(`Unsupported CBX format: ${fileExtension}`);
    }
  }

  private async extractFromZip(filePath: string, fileName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        zipfile.readEntry();

        zipfile.on('entry', entry => {
          if (entry.fileName === fileName) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', chunk => chunks.push(chunk));
              readStream.on('end', () => {
                const imageBuffer = Buffer.concat(chunks);
                resolve(imageBuffer);
              });
              readStream.on('error', reject);
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          reject(new Error(`Page ${fileName} not found in CBX file`));
        });

        zipfile.on('error', reject);
      });
    });
  }

  private async processImage(imageBuffer: Buffer, options: CbxReaderOptions): Promise<Buffer> {
    let sharpInstance = sharp(imageBuffer);

    // Resize if dimensions are specified
    if (options.maxWidth || options.maxHeight) {
      sharpInstance = sharpInstance.resize(options.maxWidth, options.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to specified format
    switch (options.format) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality: options.quality });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality: options.quality });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: options.quality });
        break;
      default:
        sharpInstance = sharpInstance.jpeg({ quality: options.quality });
    }

    return sharpInstance.toBuffer();
  }

  private generateCacheKey(bookId: number, pageNumber: number, options: CbxReaderOptions): string {
    const optionsHash = Buffer.from(JSON.stringify(options)).toString('base64');
    return `cbx:${bookId}:${pageNumber}:${optionsHash}`;
  }

  private async getCachedImage(cacheKey: string): Promise<Buffer | null> {
    try {
      const cached = await this.redis.getBuffer(cacheKey);
      return cached;
    } catch (error) {
      this.logger.warn(`Failed to get cached image ${cacheKey}:`, error.message);
      return null;
    }
  }

  private async cacheImage(cacheKey: string, imageBuffer: Buffer): Promise<void> {
    try {
      // Cache for 1 hour
      await this.redis.setBuffer(cacheKey, imageBuffer, 3600);
    } catch (error) {
      this.logger.warn(`Failed to cache image ${cacheKey}:`, error.message);
    }
  }

  private setImageHeaders(response: Response, format: string): void {
    const mimeTypes = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    response.setHeader('Content-Type', mimeTypes[format] || 'image/jpeg');
    response.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    response.setHeader('ETag', `"${Date.now()}"`);
  }

  async clearCache(bookId: number): Promise<void> {
    try {
      const pattern = `cbx:${bookId}:*`;
      await this.redis.deletePattern(pattern);
      this.logger.log(`Cleared cache for book ${bookId}`);
    } catch (error) {
      this.logger.warn(`Failed to clear cache for book ${bookId}:`, error.message);
    }
  }
}
