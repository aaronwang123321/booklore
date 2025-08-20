import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { fromPath } from 'pdf2pic';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BookMetadata } from '../interfaces/book-metadata.interface';

@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  async parse(filePath: string): Promise<BookMetadata> {
    try {
      this.logger.log(`Starting PDF parsing for: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`PDF file not found: ${filePath}`);
      }

      // Read the PDF file
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Extract metadata
      const title = pdfDoc.getTitle() || path.basename(filePath, '.pdf');
      const author = pdfDoc.getAuthor() || 'Unknown Author';
      const subject = pdfDoc.getSubject();
      const keywords = pdfDoc.getKeywords();
      const creator = pdfDoc.getCreator();
      const producer = pdfDoc.getProducer();
      const creationDate = pdfDoc.getCreationDate();
      const modificationDate = pdfDoc.getModificationDate();

      // Get page count
      const pageCount = pdfDoc.getPageCount();

      // Generate thumbnail
      const coverImage = await this.generateThumbnail(filePath);

      const result: BookMetadata = {
        title,
        author,
        isbn: null, // PDFs typically don't have ISBN in metadata
        language: null, // PDF metadata doesn't typically include language
        publisher: null, // PDF metadata doesn't typically include publisher
        publishDate: creationDate || null,
        description: subject || null,
        coverImage,
        chapters: [], // PDFs don't have structured chapters like EPUBs
        pageCount,
        format: 'pdf',
        metadata: {
          subject,
          keywords,
          creator,
          producer,
          creationDate: creationDate?.toISOString(),
          modificationDate: modificationDate?.toISOString(),
          fileSize: pdfBytes.length,
        },
      };

      this.logger.log(`Successfully parsed PDF: ${result.title} (${pageCount} pages)`);
      return result;
    } catch (error) {
      this.logger.error(`Error parsing PDF file ${filePath}:`, error);
      throw new Error(`Failed to parse PDF file: ${error.message}`);
    }
  }

  private async generateThumbnail(filePath: string): Promise<string | null> {
    try {
      this.logger.log(`Generating thumbnail for PDF: ${filePath}`);

      // Create temporary directory for thumbnail
      const tempDir = path.join(os.tmpdir(), 'booklore-thumbnails');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Configure pdf2pic
      const convert = fromPath(filePath, {
        density: 100, // Output resolution
        saveFilename: 'thumbnail',
        savePath: tempDir,
        format: 'png',
        width: 200, // Thumbnail width
        height: 300, // Thumbnail height
        quality: 75, // Image quality
      });

      // Convert first page to image
      const result = await convert(1, { responseType: 'buffer' });

      if (result.buffer) {
        // Convert buffer to base64 data URL
        const base64 = result.buffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;

        this.logger.log('Successfully generated PDF thumbnail');
        return dataUrl;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Error generating PDF thumbnail for ${filePath}:`, error.message);
      return null;
    }
  }

  async validatePdfFile(filePath: string): Promise<boolean> {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      await PDFDocument.load(pdfBytes);
      return true;
    } catch (error) {
      this.logger.error(`PDF validation failed for ${filePath}:`, error.message);
      return false;
    }
  }

  async getFileInfo(filePath: string): Promise<{ size: number; mimeType: string }> {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      mimeType: 'application/pdf',
    };
  }

  async extractTextFromPage(filePath: string, pageNumber: number): Promise<string> {
    try {
      // Note: pdf-lib doesn't support text extraction
      // For text extraction, we would need a different library like pdf-parse
      // For now, return empty string
      this.logger.warn('Text extraction from PDF not implemented yet');
      return '';
    } catch (error) {
      this.logger.error(`Error extracting text from PDF page ${pageNumber}:`, error);
      return '';
    }
  }

  async getPageImage(filePath: string, pageNumber: number): Promise<string | null> {
    try {
      const tempDir = path.join(os.tmpdir(), 'booklore-pages');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const convert = fromPath(filePath, {
        density: 150,
        saveFilename: `page-${pageNumber}`,
        savePath: tempDir,
        format: 'png',
        quality: 85,
      });

      const result = await convert(pageNumber, { responseType: 'buffer' });

      if (result.buffer) {
        const base64 = result.buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting PDF page image ${pageNumber}:`, error);
      return null;
    }
  }
}
