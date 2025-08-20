import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
// import { promisify } from 'util';
import { BookMetadata, Chapter } from '../interfaces/book-metadata.interface';
// import { createReadStream } from 'fs';
// import { pipeline } from 'stream/promises';
import * as sharp from 'sharp';

// const openZip = promisify(yauzl.open);

@Injectable()
export class CbxParser {
  private readonly logger = new Logger(CbxParser.name);

  // Supported image extensions for CBX files
  private readonly imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

  // Supported CBX formats
  private readonly supportedFormats = ['.cbz', '.cbr', '.cb7'];

  async parse(filePath: string): Promise<BookMetadata> {
    try {
      this.logger.log(`Starting CBX parsing for: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`CBX file not found: ${filePath}`);
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      if (!this.supportedFormats.includes(fileExtension)) {
        throw new Error(`Unsupported CBX format: ${fileExtension}`);
      }

      let pages: string[] = [];
      let coverImage: string | null = null;

      switch (fileExtension) {
        case '.cbz':
          ({ pages, coverImage } = await this.parseZipCbx(filePath));
          break;
        case '.cbr':
          ({ pages, coverImage } = await this.parseRarCbx(filePath));
          break;
        case '.cb7':
          ({ pages, coverImage } = await this.parse7zCbx(filePath));
          break;
        default:
          throw new Error(`Unsupported CBX format: ${fileExtension}`);
      }

      // Create chapters from pages (each page is a "chapter")
      const chapters = this.createChaptersFromPages(pages);

      const fileName = path.basename(filePath, fileExtension);

      const result: BookMetadata = {
        title: fileName,
        author: 'Unknown Author',
        isbn: null,
        language: 'en',
        publisher: null,
        publishDate: null,
        description: `CBX comic file: ${fileName}`,
        coverImage,
        chapters,
        pageCount: pages.length,
        format: 'cbx',
        metadata: {
          format: fileExtension.substring(1), // Remove the dot
          pages: pages,
          totalPages: pages.length,
          type: 'comic',
        },
      };

      this.logger.log(`Successfully parsed CBX: ${result.title} with ${result.pageCount} pages`);
      return result;
    } catch (error) {
      this.logger.error(`Error parsing CBX file ${filePath}:`, error);
      throw new Error(`Failed to parse CBX file: ${error.message}`);
    }
  }

  private async parseZipCbx(
    filePath: string,
  ): Promise<{ pages: string[]; coverImage: string | null }> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        const pages: string[] = [];
        let coverImage: string | null = null;

        zipfile.readEntry();

        zipfile.on('entry', entry => {
          const fileName = entry.fileName;

          // Skip directories and non-image files
          if (fileName.endsWith('/') || !this.isImageFile(fileName)) {
            zipfile.readEntry();
            return;
          }

          pages.push(fileName);
          zipfile.readEntry();
        });

        zipfile.on('end', async () => {
          try {
            // Sort pages naturally (handle numeric sequences properly)
            pages.sort(this.naturalSort);

            // Extract cover image (first page)
            if (pages.length > 0) {
              coverImage = await this.extractCoverFromZip(filePath, pages[0]);
            }

            resolve({ pages, coverImage });
          } catch (error) {
            reject(error);
          }
        });

        zipfile.on('error', reject);
      });
    });
  }

  private async parseRarCbx(
    _filePath: string,
  ): Promise<{ pages: string[]; coverImage: string | null }> {
    // For now, throw an error as RAR support requires additional dependencies
    // In production, you would use node-rar or similar library
    throw new Error('RAR format support not implemented yet. Please use CBZ or CB7 format.');
  }

  private async parse7zCbx(
    _filePath: string,
  ): Promise<{ pages: string[]; coverImage: string | null }> {
    // For now, throw an error as 7Z support requires additional implementation
    // In production, you would use node-7z library
    throw new Error('7Z format support not implemented yet. Please use CBZ format.');
  }

  private async extractCoverFromZip(
    filePath: string,
    coverPageName: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        zipfile.readEntry();

        zipfile.on('entry', entry => {
          if (entry.fileName === coverPageName) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', chunk => chunks.push(chunk));
              readStream.on('end', async () => {
                try {
                  const imageBuffer = Buffer.concat(chunks);

                  // Generate thumbnail using sharp
                  const thumbnail = await sharp(imageBuffer)
                    .resize(200, 300, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();

                  const base64 = `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
                  resolve(base64);
                } catch (error) {
                  this.logger.warn('Error generating cover thumbnail:', error.message);
                  resolve(null);
                }
              });
              readStream.on('error', reject);
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          resolve(null); // Cover not found
        });

        zipfile.on('error', reject);
      });
    });
  }

  private createChaptersFromPages(pages: string[]): Chapter[] {
    return pages.map((page, index) => ({
      id: `page-${index + 1}`,
      title: `Page ${index + 1}`,
      href: page,
      order: index,
      content: null,
    }));
  }

  private isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.imageExtensions.includes(ext);
  }

  private naturalSort(a: string, b: string): number {
    // Natural sorting to handle numeric sequences properly
    // e.g., page1.jpg, page2.jpg, page10.jpg instead of page1.jpg, page10.jpg, page2.jpg
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  async validateCbxFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      if (!this.supportedFormats.includes(fileExtension)) {
        return false;
      }

      // For ZIP files, try to open and check if it contains images
      if (fileExtension === '.cbz') {
        return await this.validateZipCbx(filePath);
      }

      // For other formats, just check extension for now
      return true;
    } catch (error) {
      this.logger.error(`CBX validation failed for ${filePath}:`, error.message);
      return false;
    }
  }

  private async validateZipCbx(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          resolve(false);
          return;
        }

        let hasImages = false;
        zipfile.readEntry();

        zipfile.on('entry', entry => {
          if (this.isImageFile(entry.fileName)) {
            hasImages = true;
            zipfile.close();
            resolve(true);
            return;
          }
          zipfile.readEntry();
        });

        zipfile.on('end', () => {
          resolve(hasImages);
        });

        zipfile.on('error', () => {
          resolve(false);
        });
      });
    });
  }

  async getFileInfo(filePath: string): Promise<{ size: number; mimeType: string }> {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let mimeType = 'application/octet-stream';
    switch (ext) {
      case '.cbz':
        mimeType = 'application/vnd.comicbook+zip';
        break;
      case '.cbr':
        mimeType = 'application/vnd.comicbook-rar';
        break;
      case '.cb7':
        mimeType = 'application/x-cb7';
        break;
    }

    return {
      size: stats.size,
      mimeType,
    };
  }
}
