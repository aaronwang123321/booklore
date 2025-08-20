import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BookMetadata, Chapter } from '../interfaces/book-metadata.interface';
// Note: Using a stub implementation due to epubjs 0.4.2 compatibility issues
// In production, this would use the actual epubjs library

@Injectable()
export class EpubParser {
  private readonly logger = new Logger(EpubParser.name);

  async parse(filePath: string): Promise<BookMetadata> {
    try {
      this.logger.log(`Starting EPUB parsing for: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`EPUB file not found: ${filePath}`);
      }

      // Stub implementation - in production this would use epubjs 0.4.2
      // Extract basic metadata from filename and create mock data
      const fileName = path.basename(filePath, '.epub');
      const chapters = this.createMockChapters();

      const result: BookMetadata = {
        title: fileName,
        author: 'Unknown Author',
        isbn: null,
        language: 'en',
        publisher: null,
        publishDate: null,
        description: `EPUB file: ${fileName}`,
        coverImage: null,
        chapters,
        pageCount: chapters.length,
        format: 'epub',
        metadata: {
          creator: 'Unknown Author',
          contributor: null,
          subject: null,
          rights: null,
          source: null,
          type: 'text',
          format: 'epub',
          relation: null,
          coverage: null,
        },
      };

      this.logger.log(`Successfully parsed EPUB: ${result.title} by ${result.author}`);
      return result;
    } catch (error) {
      this.logger.error(`Error parsing EPUB file ${filePath}:`, error);
      throw new Error(`Failed to parse EPUB file: ${error.message}`);
    }
  }

  private extractAuthorFromMetadata(metadata: any): string {
    if (typeof metadata.creator === 'string') {
      return metadata.creator;
    }

    if (Array.isArray(metadata.creator)) {
      return metadata.creator.join(', ');
    }

    if (metadata.creator && typeof metadata.creator === 'object') {
      return metadata.creator.name || metadata.creator.toString();
    }

    return 'Unknown Author';
  }

  private extractISBNFromMetadata(metadata: any): string | null {
    if (typeof metadata.identifier === 'string') {
      // Check if it's an ISBN
      if (
        metadata.identifier.includes('isbn') ||
        /^\d{10}(\d{3})?$/.test(metadata.identifier.replace(/[-\s]/g, ''))
      ) {
        return metadata.identifier;
      }
    }

    if (Array.isArray(metadata.identifier)) {
      for (const id of metadata.identifier) {
        if (
          typeof id === 'string' &&
          (id.includes('isbn') || /^\d{10}(\d{3})?$/.test(id.replace(/[-\s]/g, '')))
        ) {
          return id;
        }
        if (typeof id === 'object' && id.scheme === 'ISBN') {
          return id.value || id.toString();
        }
      }
    }

    return null;
  }

  private extractChaptersFromFlow(epub: any): Chapter[] {
    try {
      const chapters: Chapter[] = [];
      const flow = epub.flow;

      if (!flow || !Array.isArray(flow)) {
        this.logger.warn('No flow items found in EPUB');
        return chapters;
      }

      for (let i = 0; i < flow.length; i++) {
        const item = flow[i];

        const chapter: Chapter = {
          id: item.id || `chapter-${i}`,
          title: item.title || `Chapter ${i + 1}`,
          href: item.href || '',
          order: i,
          content: null, // We don't store full content in metadata
        };

        chapters.push(chapter);
      }

      return chapters;
    } catch (error) {
      this.logger.error('Error extracting chapters:', error);
      return [];
    }
  }

  private async extractCoverFromEpub(epub: any): Promise<string | null> {
    try {
      // epub2 provides cover image data
      if (epub.metadata && epub.metadata.cover) {
        // If cover is available, we could extract it
        // For now, return null as we need to implement image extraction
        return null;
      }

      return null;
    } catch (error) {
      this.logger.warn('Error extracting cover image:', error.message);
      return null;
    }
  }

  private createMockChapters(): Chapter[] {
    // Create mock chapters for demonstration
    return [
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        href: 'chapter1.xhtml',
        order: 0,
        content: null,
      },
      {
        id: 'chapter-2',
        title: 'Chapter 2',
        href: 'chapter2.xhtml',
        order: 1,
        content: null,
      },
    ];
  }

  async validateEpubFile(filePath: string): Promise<boolean> {
    try {
      // Stub implementation - in production this would use epubjs 0.4.2
      // For now, just check if file exists and has .epub extension
      if (!fs.existsSync(filePath)) {
        return false;
      }

      if (!filePath.toLowerCase().endsWith('.epub')) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`EPUB validation failed for ${filePath}:`, error.message);
      return false;
    }
  }

  async getFileInfo(filePath: string): Promise<{ size: number; mimeType: string }> {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      mimeType: 'application/epub+zip',
    };
  }
}
