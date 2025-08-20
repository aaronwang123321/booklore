import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { GoogleBooksProvider } from '../providers/google-books.provider';
import { GoodreadsProvider } from '../providers/goodreads.provider';
import { AmazonProvider } from '../providers/amazon.provider';
import { MetadataMatcherService } from './metadata-matcher.service';
import { MetadataHistoryService } from './metadata-history.service';
import { MetadataTemplateService } from './metadata-template.service';
import {
  MetadataProvider,
  MetadataSearchQuery,
  MetadataSearchResult,
  ExternalMetadata,
  MetadataMatchResult,
  MetadataSource,
  BookMetadataUpdate,
  MetadataRefreshConfig,
} from '../interfaces/metadata.interface';
import {
  MetadataSearchDto,
  BookMetadataUpdateDto,
  BulkMetadataUpdateDto,
  MetadataRefreshConfigDto,
} from '../dto/metadata.dto';

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private readonly providers: Map<MetadataSource, MetadataProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleBooksProvider: GoogleBooksProvider,
    private readonly goodreadsProvider: GoodreadsProvider,
    private readonly amazonProvider: AmazonProvider,
    private readonly matcherService: MetadataMatcherService,
    private readonly historyService: MetadataHistoryService,
    private readonly templateService: MetadataTemplateService,
  ) {
    // Register providers
    this.providers.set(MetadataSource.GOOGLE_BOOKS, this.googleBooksProvider);
    this.providers.set(MetadataSource.GOODREADS, this.goodreadsProvider);
    this.providers.set(MetadataSource.AMAZON, this.amazonProvider);
  }

  /**
   * Convert DTO with string dates to internal format with Date objects
   */
  private convertDtoToInternal(dto: BookMetadataUpdateDto): BookMetadataUpdate {
    const result: any = { ...dto };
    if (dto.publishDate) {
      result.publishDate = new Date(dto.publishDate);
    }
    return result as BookMetadataUpdate;
  }

  /**
   * Search for metadata across multiple sources
   */
  async searchMetadata(searchDto: MetadataSearchDto): Promise<{
    results: MetadataSearchResult[];
    bestMatch: MetadataMatchResult;
  }> {
    try {
      const query: MetadataSearchQuery = {
        title: searchDto.title,
        author: searchDto.author,
        isbn: searchDto.isbn,
        language: searchDto.language,
        year: searchDto.year,
      };

      const sourcesToSearch = searchDto.sources || [
        MetadataSource.GOOGLE_BOOKS,
        MetadataSource.GOODREADS,
        MetadataSource.AMAZON,
      ];

      this.logger.log(`Searching metadata across ${sourcesToSearch.length} sources`);

      // Search all sources in parallel
      const searchPromises = sourcesToSearch.map(async source => {
        try {
          const provider = this.providers.get(source);
          if (!provider) {
            this.logger.warn(`Provider not found for source: ${source}`);
            return null;
          }

          const isAvailable = await provider.isAvailable();
          if (!isAvailable) {
            this.logger.warn(`Provider ${source} is not available`);
            return null;
          }

          return await provider.search(query);
        } catch (error) {
          this.logger.error(`Error searching ${source}: ${error.message}`);
          return null;
        }
      });

      const searchResults = (await Promise.all(searchPromises)).filter(Boolean);

      // Combine all results for matching
      const allMetadata: ExternalMetadata[] = [];
      searchResults.forEach(result => {
        if (result) {
          allMetadata.push(...result.results.slice(0, searchDto.limit || 10));
        }
      });

      // Find best match
      const bestMatch = this.matcherService.findBestMatch(query, allMetadata);

      this.logger.log(
        `Found ${allMetadata.length} total results, best match confidence: ${bestMatch.confidence.toFixed(2)}`,
      );

      return {
        results: searchResults,
        bestMatch,
      };
    } catch (error) {
      this.logger.error(`Error searching metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get metadata by ISBN from all sources
   */
  async getMetadataByIsbn(isbn: string): Promise<MetadataMatchResult> {
    try {
      this.logger.log(`Getting metadata by ISBN: ${isbn}`);

      const searchPromises = Array.from(this.providers.values()).map(async provider => {
        try {
          const isAvailable = await provider.isAvailable();
          if (!isAvailable) return null;

          return await provider.getByIsbn(isbn);
        } catch (error) {
          this.logger.error(`Error getting metadata from ${provider.name}: ${error.message}`);
          return null;
        }
      });

      const results = (await Promise.all(searchPromises)).filter(Boolean);

      const query: MetadataSearchQuery = { isbn };
      return this.matcherService.findBestMatch(query, results);
    } catch (error) {
      this.logger.error(`Error getting metadata by ISBN: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update book metadata with history tracking
   */
  async updateBookMetadata(
    bookId: number,
    updateDto: BookMetadataUpdateDto,
    userId: number,
  ): Promise<void> {
    try {
      // Get current book data
      const currentBook = await this.prisma.book.findUnique({
        where: { id: bookId },
      });

      if (!currentBook) {
        throw new NotFoundException(`Book ${bookId} not found`);
      }

      // Track changes
      const changes: Record<string, { oldValue: any; newValue: any }> = {};
      const updateData: any = {};

      // Check each field for changes
      const fieldsToCheck = [
        'title',
        'author',
        'isbn',
        'language',
        'publisher',
        'publishDate',
        'description',
        'genres',
        'rating',
        'pageCount',
      ];

      for (const field of fieldsToCheck) {
        const newValue = (updateDto as any)[field];
        const oldValue =
          field === 'publishDate' && currentBook[field]
            ? currentBook[field].toISOString().split('T')[0]
            : currentBook[field];

        if (newValue !== undefined && newValue !== oldValue) {
          changes[field] = { oldValue, newValue };

          if (field === 'publishDate' && newValue) {
            updateData[field] = new Date(newValue);
          } else if (field === 'coverImageUrl') {
            updateData.coverImage = newValue;
          } else {
            updateData[field] = newValue;
          }
        }
      }

      if (Object.keys(changes).length === 0) {
        this.logger.log(`No changes detected for book ${bookId}`);
        return;
      }

      // Update book and record history in transaction
      await this.prisma.$transaction(async tx => {
        // Update book
        await tx.book.update({
          where: { id: bookId },
          data: {
            ...updateData,
            updatedAt: new Date(),
          },
        });

        // Record history
        await this.historyService.recordBulkChanges(
          bookId,
          changes,
          updateDto.source,
          userId,
          updateDto.reason,
        );
      });

      this.logger.log(
        `Updated metadata for book ${bookId} with ${Object.keys(changes).length} changes`,
      );
    } catch (error) {
      this.logger.error(`Error updating book metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk update metadata for multiple books
   */
  async bulkUpdateMetadata(
    bulkUpdateDto: BulkMetadataUpdateDto,
    userId: number,
  ): Promise<{
    successful: number[];
    failed: { bookId: number; error: string }[];
  }> {
    try {
      this.logger.log(`Starting bulk metadata update for ${bulkUpdateDto.bookIds.length} books`);

      const successful: number[] = [];
      const failed: { bookId: number; error: string }[] = [];

      // Apply template if specified
      let finalUpdates = bulkUpdateDto.updates;
      if (bulkUpdateDto.templateId) {
        try {
          const templateBase = this.convertDtoToInternal(bulkUpdateDto.updates);
          const templateResult = await this.templateService.applyTemplate(
            bulkUpdateDto.templateId,
            templateBase,
            userId,
          );
          finalUpdates = {
            ...templateResult,
            source: bulkUpdateDto.updates.source,
          } as any;
        } catch (error) {
          this.logger.error(`Error applying template: ${error.message}`);
          // Continue with original updates if template fails
        }
      }

      // Update each book
      for (const bookId of bulkUpdateDto.bookIds) {
        try {
          await this.updateBookMetadata(bookId, finalUpdates, userId);
          successful.push(bookId);
        } catch (error) {
          failed.push({ bookId, error: error.message });
        }
      }

      this.logger.log(
        `Bulk update completed: ${successful.length} successful, ${failed.length} failed`,
      );
      return { successful, failed };
    } catch (error) {
      this.logger.error(`Error in bulk metadata update: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-refresh metadata for books with outdated information
   */
  async refreshMetadata(
    bookIds: number[],
    config: MetadataRefreshConfigDto,
    userId: number,
  ): Promise<{
    refreshed: number[];
    failed: { bookId: number; error: string }[];
  }> {
    try {
      this.logger.log(`Starting metadata refresh for ${bookIds.length} books`);

      const refreshed: number[] = [];
      const failed: { bookId: number; error: string }[] = [];

      for (const bookId of bookIds) {
        try {
          const book = await this.prisma.book.findUnique({
            where: { id: bookId },
          });

          if (!book) {
            failed.push({ bookId, error: 'Book not found' });
            continue;
          }

          // Check if refresh is needed
          const daysSinceUpdate = book.updatedAt
            ? Math.floor((Date.now() - book.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
            : Infinity;

          if (daysSinceUpdate < config.maxAge) {
            this.logger.debug(`Book ${bookId} is up to date (${daysSinceUpdate} days old)`);
            continue;
          }

          // Search for updated metadata
          const searchQuery: MetadataSearchQuery = {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
          };

          const searchDto: MetadataSearchDto = {
            ...searchQuery,
            sources: config.sources,
            limit: 5,
          };

          const { bestMatch } = await this.searchMetadata(searchDto);

          if (bestMatch.bestMatch && bestMatch.confidence > 0.7) {
            // Update with new metadata
            const updateDto: BookMetadataUpdateDto = {
              title: bestMatch.bestMatch.title,
              author: bestMatch.bestMatch.author,
              isbn: bestMatch.bestMatch.isbn,
              language: bestMatch.bestMatch.language,
              publisher: bestMatch.bestMatch.publisher,
              publishDate: bestMatch.bestMatch.publishDate?.toISOString().split('T')[0],
              description: bestMatch.bestMatch.description,
              coverImageUrl: bestMatch.bestMatch.coverImageUrl,
              genres: bestMatch.bestMatch.genres,
              rating: bestMatch.bestMatch.rating,
              pageCount: bestMatch.bestMatch.pageCount,
              source: bestMatch.bestMatch.source,
              reason: `Automatic refresh (confidence: ${bestMatch.confidence.toFixed(2)})`,
            };

            await this.updateBookMetadata(bookId, updateDto, userId);
            refreshed.push(bookId);
          } else {
            failed.push({
              bookId,
              error: `No suitable metadata found (confidence: ${bestMatch.confidence.toFixed(2)})`,
            });
          }
        } catch (error) {
          failed.push({ bookId, error: error.message });
        }
      }

      this.logger.log(
        `Metadata refresh completed: ${refreshed.length} refreshed, ${failed.length} failed`,
      );
      return { refreshed, failed };
    } catch (error) {
      this.logger.error(`Error refreshing metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get enhanced metadata for a book (combining file metadata with external sources)
   */
  async getEnhancedMetadata(bookId: number): Promise<{
    current: any;
    suggestions: ExternalMetadata[];
    confidence: number;
  }> {
    try {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
      });

      if (!book) {
        throw new NotFoundException(`Book ${bookId} not found`);
      }

      // Search for additional metadata
      const searchQuery: MetadataSearchQuery = {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
      };

      const { bestMatch } = await this.searchMetadata({
        ...searchQuery,
        limit: 5,
      });

      return {
        current: book,
        suggestions: bestMatch.allMatches,
        confidence: bestMatch.confidence,
      };
    } catch (error) {
      this.logger.error(`Error getting enhanced metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available metadata sources and their status
   */
  async getSourceStatus(): Promise<
    {
      source: MetadataSource;
      available: boolean;
      lastChecked: Date;
    }[]
  > {
    const results = [];

    for (const [source, provider] of this.providers) {
      try {
        const available = await provider.isAvailable();
        results.push({
          source,
          available,
          lastChecked: new Date(),
        });
      } catch (error) {
        results.push({
          source,
          available: false,
          lastChecked: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Merge metadata from multiple sources intelligently
   */
  async mergeMetadataFromSources(sources: ExternalMetadata[]): Promise<ExternalMetadata> {
    return this.matcherService.mergeMetadata(sources);
  }

  /**
   * Schedule automatic metadata refresh for books
   */
  async scheduleMetadataRefresh(libraryId: number, config: MetadataRefreshConfig): Promise<void> {
    try {
      // This would integrate with a job scheduler like BullMQ
      // For now, just log the scheduling
      this.logger.log(`Scheduled metadata refresh for library ${libraryId} with config:`, config);

      // In a real implementation, you would:
      // 1. Store the config in the database
      // 2. Schedule a recurring job
      // 3. The job would call refreshMetadata for books in the library
    } catch (error) {
      this.logger.error(`Error scheduling metadata refresh: ${error.message}`);
      throw error;
    }
  }
}
