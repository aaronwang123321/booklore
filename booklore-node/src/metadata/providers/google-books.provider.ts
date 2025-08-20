import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  MetadataProvider,
  MetadataSearchQuery,
  MetadataSearchResult,
  ExternalMetadata,
  MetadataSource,
} from '../interfaces/metadata.interface';

@Injectable()
export class GoogleBooksProvider implements MetadataProvider {
  private readonly logger = new Logger(GoogleBooksProvider.name);
  readonly name = MetadataSource.GOOGLE_BOOKS;
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('GOOGLE_BOOKS_API_KEY');
  }

  async search(query: MetadataSearchQuery): Promise<MetadataSearchResult> {
    try {
      const searchQuery = this.buildSearchQuery(query);
      const url = `${this.baseUrl}?q=${encodeURIComponent(searchQuery)}&maxResults=40`;

      const params: any = {};
      if (this.apiKey) {
        params.key = this.apiKey;
      }

      this.logger.debug(`Searching Google Books with query: ${searchQuery}`);

      const response = await firstValueFrom(this.httpService.get<any>(url, { params }));

      const results = this.parseSearchResults(response.data);

      return {
        results,
        totalResults: response.data.totalItems || 0,
        source: this.name,
        query,
      };
    } catch (error) {
      this.logger.error(`Error searching Google Books: ${error.message}`);
      return {
        results: [],
        totalResults: 0,
        source: this.name,
        query,
      };
    }
  }

  async getByIsbn(isbn: string): Promise<ExternalMetadata | null> {
    try {
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      const url = `${this.baseUrl}?q=isbn:${cleanIsbn}`;

      const params: any = {};
      if (this.apiKey) {
        params.key = this.apiKey;
      }

      this.logger.debug(`Searching Google Books by ISBN: ${cleanIsbn}`);

      const response = await firstValueFrom(this.httpService.get<any>(url, { params }));

      const results = this.parseSearchResults(response.data);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      this.logger.error(`Error searching Google Books by ISBN: ${error.message}`);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<any>(`${this.baseUrl}?q=test&maxResults=1`, {
          timeout: 5000,
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Google Books API is not available: ${error.message}`);
      return false;
    }
  }

  private buildSearchQuery(query: MetadataSearchQuery): string {
    const parts: string[] = [];

    if (query.title) {
      parts.push(`intitle:"${query.title}"`);
    }

    if (query.author) {
      parts.push(`inauthor:"${query.author}"`);
    }

    if (query.isbn) {
      parts.push(`isbn:${query.isbn.replace(/[-\s]/g, '')}`);
    }

    if (query.language) {
      parts.push(`langRestrict:${query.language}`);
    }

    return parts.length > 0 ? parts.join(' ') : 'books';
  }

  private parseSearchResults(data: any): ExternalMetadata[] {
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => this.parseBookItem(item)).filter(Boolean);
  }

  private parseBookItem(item: any): ExternalMetadata | null {
    try {
      const volumeInfo = item.volumeInfo || {};
      // const saleInfo = item.saleInfo || {};

      // Calculate confidence based on available data
      let confidence = 0.5; // Base confidence
      if (volumeInfo.title) confidence += 0.2;
      if (volumeInfo.authors && volumeInfo.authors.length > 0) confidence += 0.2;
      if (volumeInfo.industryIdentifiers) confidence += 0.1;
      if (volumeInfo.description) confidence += 0.1;

      const metadata: ExternalMetadata = {
        source: this.name,
        title: volumeInfo.title || 'Unknown Title',
        author: volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Unknown Author',
        isbn: this.extractIsbn(volumeInfo.industryIdentifiers),
        language: volumeInfo.language,
        publisher: volumeInfo.publisher,
        publishDate: volumeInfo.publishedDate
          ? this.parseDate(volumeInfo.publishedDate)
          : undefined,
        description: volumeInfo.description,
        coverImageUrl: this.getBestCoverImage(volumeInfo.imageLinks),
        genres: volumeInfo.categories || [],
        rating: volumeInfo.averageRating,
        pageCount: volumeInfo.pageCount,
        confidence: Math.min(confidence, 1.0),
        rawData: item,
      };

      return metadata;
    } catch (error) {
      this.logger.warn(`Error parsing Google Books item: ${error.message}`);
      return null;
    }
  }

  private extractIsbn(identifiers: any[]): string | undefined {
    if (!identifiers || !Array.isArray(identifiers)) {
      return undefined;
    }

    // Prefer ISBN_13 over ISBN_10
    const isbn13 = identifiers.find(id => id.type === 'ISBN_13');
    if (isbn13) return isbn13.identifier;

    const isbn10 = identifiers.find(id => id.type === 'ISBN_10');
    if (isbn10) return isbn10.identifier;

    // Fallback to any identifier that looks like an ISBN
    const anyIsbn = identifiers.find(id => id.identifier && /^[\d-]{10,17}$/.test(id.identifier));
    return anyIsbn?.identifier;
  }

  private getBestCoverImage(imageLinks: any): string | undefined {
    if (!imageLinks) return undefined;

    // Prefer higher resolution images
    return (
      imageLinks.extraLarge ||
      imageLinks.large ||
      imageLinks.medium ||
      imageLinks.small ||
      imageLinks.thumbnail ||
      imageLinks.smallThumbnail
    );
  }

  private parseDate(dateString: string): Date | undefined {
    try {
      // Google Books dates can be in various formats: YYYY, YYYY-MM, YYYY-MM-DD
      if (/^\d{4}$/.test(dateString)) {
        return new Date(`${dateString}-01-01`);
      } else if (/^\d{4}-\d{2}$/.test(dateString)) {
        return new Date(`${dateString}-01`);
      } else {
        return new Date(dateString);
      }
    } catch (error) {
      this.logger.warn(`Error parsing date: ${dateString}`);
      return undefined;
    }
  }
}
