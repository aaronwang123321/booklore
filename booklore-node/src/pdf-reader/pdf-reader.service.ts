import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { PdfParser } from '../book/parsers/pdf.parser';
import {
  PdfMetadataResponseDto,
  PdfPageResponseDto,
  PdfTextResponseDto,
} from './dto/pdf-reader.dto';
import * as fs from 'fs';

@Injectable()
export class PdfReaderService {
  private readonly logger = new Logger(PdfReaderService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly pdfParser: PdfParser,
  ) {}

  async get_pdf_metadata(bookId: number): Promise<PdfMetadataResponseDto> {
    try {
      this.logger.log(`Getting PDF metadata for book ID: ${bookId}`);

      // Get book from database
      const book = await this.prismaService.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          title: true,
          filePath: true,
        },
      });

      if (!book) {
        throw new NotFoundException(`Book with ID ${bookId} not found`);
      }

      // Note: format field validation would be added when Book model includes format field

      if (!book.filePath || !fs.existsSync(book.filePath)) {
        throw new NotFoundException(`PDF file not found for book ID ${bookId}`);
      }

      // Parse PDF metadata
      const metadata = await this.pdfParser.parse(book.filePath);

      const response: PdfMetadataResponseDto = {
        totalPages: metadata.pageCount || 0,
        title: metadata.title || book.title,
        author: metadata.author || 'Unknown Author',
        subject: metadata.description,
        creationDate: metadata.publishDate?.toISOString(),
        fileSize: metadata.metadata?.fileSize || 0,
      };

      this.logger.log(`Successfully retrieved PDF metadata for book ID: ${bookId}`);
      return response;
    } catch (error) {
      this.logger.error(`Error getting PDF metadata for book ID ${bookId}:`, error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get PDF metadata: ${error.message}`);
    }
  }

  async get_pdf_page(
    bookId: number,
    pageNumber: number,
    _quality?: number,
    _density?: number,
  ): Promise<PdfPageResponseDto> {
    try {
      this.logger.log(`Getting PDF page ${pageNumber} for book ID: ${bookId}`);

      // Get book from database
      const book = await this.prismaService.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          filePath: true,
        },
      });

      if (!book) {
        throw new NotFoundException(`Book with ID ${bookId} not found`);
      }

      // Note: format field validation would be added when Book model includes format field

      if (!book.filePath || !fs.existsSync(book.filePath)) {
        throw new NotFoundException(`PDF file not found for book ID ${bookId}`);
      }

      // Validate page number
      const metadata = await this.pdfParser.parse(book.filePath);
      if (pageNumber < 1 || pageNumber > (metadata.pageCount || 0)) {
        throw new BadRequestException(
          `Invalid page number ${pageNumber}. PDF has ${metadata.pageCount} pages`,
        );
      }

      // Get page image
      const imageData = await this.pdfParser.getPageImage(book.filePath, pageNumber);

      if (!imageData) {
        throw new BadRequestException(`Failed to generate image for page ${pageNumber}`);
      }

      const response: PdfPageResponseDto = {
        pageNumber,
        imageData,
        width: 595, // Default PDF page width
        height: 842, // Default PDF page height
      };

      this.logger.log(`Successfully retrieved PDF page ${pageNumber} for book ID: ${bookId}`);
      return response;
    } catch (error) {
      this.logger.error(`Error getting PDF page ${pageNumber} for book ID ${bookId}:`, error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get PDF page: ${error.message}`);
    }
  }

  async extract_text_from_page(bookId: number, pageNumber: number): Promise<PdfTextResponseDto> {
    try {
      this.logger.log(`Extracting text from page ${pageNumber} for book ID: ${bookId}`);

      // Get book from database
      const book = await this.prismaService.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          filePath: true,
        },
      });

      if (!book) {
        throw new NotFoundException(`Book with ID ${bookId} not found`);
      }

      // Note: format field validation would be added when Book model includes format field

      if (!book.filePath || !fs.existsSync(book.filePath)) {
        throw new NotFoundException(`PDF file not found for book ID ${bookId}`);
      }

      // Validate page number
      const metadata = await this.pdfParser.parse(book.filePath);
      if (pageNumber < 1 || pageNumber > (metadata.pageCount || 0)) {
        throw new BadRequestException(
          `Invalid page number ${pageNumber}. PDF has ${metadata.pageCount} pages`,
        );
      }

      // Extract text from page
      const text = await this.pdfParser.extractTextFromPage(book.filePath, pageNumber);

      const response: PdfTextResponseDto = {
        pageNumber,
        text: text || '', // Return empty string if no text extracted
      };

      this.logger.log(`Successfully extracted text from page ${pageNumber} for book ID: ${bookId}`);
      return response;
    } catch (error) {
      this.logger.error(
        `Error extracting text from page ${pageNumber} for book ID ${bookId}:`,
        error,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to extract text from page: ${error.message}`);
    }
  }

  async get_available_pages(bookId: number): Promise<number[]> {
    try {
      this.logger.log(`Getting available pages for book ID: ${bookId}`);

      // Get PDF metadata to determine page count
      const metadata = await this.get_pdf_metadata(bookId);

      // Generate array of page numbers from 1 to totalPages
      const pages = Array.from({ length: metadata.totalPages }, (_, i) => i + 1);

      this.logger.log(
        `Successfully retrieved ${pages.length} available pages for book ID: ${bookId}`,
      );
      return pages;
    } catch (error) {
      this.logger.error(`Error getting available pages for book ID ${bookId}:`, error);
      throw error; // Re-throw the error from get_pdf_metadata
    }
  }

  async validate_pdf_file(bookId: number): Promise<boolean> {
    try {
      this.logger.log(`Validating PDF file for book ID: ${bookId}`);

      // Get book from database
      const book = await this.prismaService.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          filePath: true,
        },
      });

      if (!book) {
        return false;
      }

      // Note: format field validation would be added when Book model includes format field

      if (!book.filePath || !fs.existsSync(book.filePath)) {
        return false;
      }

      // Validate PDF file using parser
      const isValid = await this.pdfParser.validatePdfFile(book.filePath);

      this.logger.log(`PDF validation result for book ID ${bookId}: ${isValid}`);
      return isValid;
    } catch (error) {
      this.logger.error(`Error validating PDF file for book ID ${bookId}:`, error);
      return false;
    }
  }
}
