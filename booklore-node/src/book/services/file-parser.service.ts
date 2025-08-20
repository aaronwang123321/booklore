import { Injectable, Logger } from '@nestjs/common';
import { EpubParser } from '../parsers/epub.parser';
import { PdfParser } from '../parsers/pdf.parser';
import { CbxParser } from '../parsers/cbx.parser';
import { BookMetadata, ParseResult, ParserOptions } from '../interfaces/book-metadata.interface';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  constructor(
    private readonly epubParser: EpubParser,
    private readonly pdfParser: PdfParser,
    private readonly cbxParser: CbxParser,
  ) {}

  async parseFile(filePath: string, options: ParserOptions = {}): Promise<ParseResult> {
    try {
      this.logger.log(`Starting file parsing for: ${filePath}`);

      // Validate file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      // Check file size if limit is specified
      if (options.maxFileSize) {
        const stats = fs.statSync(filePath);
        if (stats.size > options.maxFileSize) {
          return {
            success: false,
            error: `File size (${stats.size} bytes) exceeds maximum allowed size (${options.maxFileSize} bytes)`,
          };
        }
      }

      // Determine file type
      const fileType = this.getFileType(filePath);

      let metadata: BookMetadata;

      // Parse based on file type
      switch (fileType) {
        case 'epub':
          metadata = await this.parseWithTimeout(
            () => this.epubParser.parse(filePath),
            options.timeout || 30000, // 30 second default timeout
            'EPUB parsing',
          );
          break;

        case 'pdf':
          metadata = await this.parseWithTimeout(
            () => this.pdfParser.parse(filePath),
            options.timeout || 60000, // 60 second default timeout for PDFs
            'PDF parsing',
          );
          break;

        case 'cbx':
          metadata = await this.parseWithTimeout(
            () => this.cbxParser.parse(filePath),
            options.timeout || 45000, // 45 second default timeout for CBX
            'CBX parsing',
          );
          break;

        default:
          return {
            success: false,
            error: `Unsupported file type: ${fileType}`,
          };
      }

      this.logger.log(`Successfully parsed file: ${metadata.title}`);

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Error parsing file ${filePath}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async validateFile(filePath: string): Promise<boolean> {
    try {
      const fileType = this.getFileType(filePath);

      switch (fileType) {
        case 'epub':
          return await this.epubParser.validateEpubFile(filePath);
        case 'pdf':
          return await this.pdfParser.validatePdfFile(filePath);
        case 'cbx':
          return await this.cbxParser.validateCbxFile(filePath);
        default:
          return false;
      }
    } catch (error) {
      this.logger.error(`Error validating file ${filePath}:`, error);
      return false;
    }
  }

  getFileType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    switch (extension) {
      case '.epub':
        return 'epub';
      case '.pdf':
        return 'pdf';
      case '.cbz':
      case '.cbr':
      case '.cb7':
        return 'cbx';
      default:
        return 'unknown';
    }
  }

  getSupportedFormats(): string[] {
    return ['epub', 'pdf', 'cbx'];
  }

  async getFileInfo(filePath: string) {
    const fileType = this.getFileType(filePath);
    const stats = fs.statSync(filePath);

    let mimeType = 'application/octet-stream';

    switch (fileType) {
      case 'epub':
        mimeType = 'application/epub+zip';
        break;
      case 'pdf':
        mimeType = 'application/pdf';
        break;
      case 'cbx':
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.cbz') mimeType = 'application/vnd.comicbook+zip';
        else if (ext === '.cbr') mimeType = 'application/vnd.comicbook-rar';
        else if (ext === '.cb7') mimeType = 'application/x-cb7';
        else mimeType = 'application/vnd.comicbook+zip';
        break;
    }

    return {
      size: stats.size,
      mimeType,
      extension: path.extname(filePath),
      type: fileType,
      name: path.basename(filePath),
      lastModified: stats.mtime,
    };
  }

  private async parseWithTimeout<T>(
    parseFunction: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      parseFunction()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  async parseMultipleFiles(
    filePaths: string[],
    options: ParserOptions = {},
  ): Promise<ParseResult[]> {
    this.logger.log(`Starting batch parsing of ${filePaths.length} files`);

    const results: ParseResult[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.parseFile(filePath, options);
        results.push(result);

        // Add small delay between files to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          success: false,
          error: `Error parsing ${filePath}: ${error.message}`,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(
      `Batch parsing completed: ${successCount}/${filePaths.length} files successful`,
    );

    return results;
  }

  async streamParseFile(
    filePath: string,
    options: ParserOptions = {},
  ): Promise<AsyncGenerator<{ progress: number; status: string; result?: ParseResult }>> {
    const generator = async function* (this: FileParserService) {
      yield { progress: 0, status: 'Starting file validation...' };

      // Validate file
      const isValid = await this.validateFile(filePath);
      if (!isValid) {
        yield {
          progress: 100,
          status: 'Validation failed',
          result: { success: false, error: 'File validation failed' },
        };
        return;
      }

      yield { progress: 20, status: 'File validated, starting parsing...' };

      // Parse file
      const result = await this.parseFile(filePath, options);

      yield { progress: 100, status: 'Parsing completed', result };
    }.bind(this);

    return generator();
  }
}
