import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as xml2js from 'xml2js';
import {
  MetadataProvider,
  MetadataSearchQuery,
  MetadataSearchResult,
  ExternalMetadata,
  MetadataSource,
} from '../interfaces/metadata.interface';

@Injectable()
export class GoodreadsProvider implements MetadataProvider {
  private readonly logger = new Logger(GoodreadsProvider.name);
  readonly name = MetadataSource.GOODREADS;
  private readonly baseUrl = 'https://www.goodreads.com';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('GOODREADS_API_KEY');
  }

  async search(query: MetadataSearchQuery): Promise<MetadataSearchResult> {
    try {
      if (!this.apiKey) {
        this.logger.warn('Goodreads API key not configured');
        return {
          results: [],
          totalResults: 0,
          source: this.name,
          query,
        };
      }

      const searchQuery = this.buildSearchQuery(query);
      const url = `${this.baseUrl}/search/index.xml`;

      const params = {
        key: this.apiKey,
        q: searchQuery,
        page: 1,
        per_page: 20,
      };

      this.logger.debug(`Searching Goodreads with query: ${searchQuery}`);

      const response = await firstValueFrom(this.httpService.get<string>(url, { params }));

      const results = await this.parseSearchResults(response.data);

      return {
        results,
        totalResults: results.length, // Goodreads doesn't provide total count
        source: this.name,
        query,
      };
    } catch (error) {
      this.logger.error(`Error searching Goodreads: ${error.message}`);
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
      if (!this.apiKey) {
        this.logger.warn('Goodreads API key not configured');
        return null;
      }

      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      const url = `${this.baseUrl}/book/isbn_to_id/${cleanIsbn}`;

      const params = {
        key: this.apiKey,
      };

      this.logger.debug(`Searching Goodreads by ISBN: ${cleanIsbn}`);

      // First get the book ID from ISBN
      const idResponse = await firstValueFrom(this.httpService.get<string>(url, { params }));

      const bookId = idResponse.data.trim();
      if (!bookId || bookId === 'Book not found') {
        return null;
      }

      // Then get book details
      const bookUrl = `${this.baseUrl}/book/show/${bookId}.xml`;
      const bookResponse = await firstValueFrom(this.httpService.get<string>(bookUrl, { params }));

      const results = await this.parseBookDetails(bookResponse.data);
      return results;
    } catch (error) {
      this.logger.error(`Error searching Goodreads by ISBN: ${error.message}`);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }

      const response = await firstValueFrom(
        this.httpService.get<any>(`${this.baseUrl}/search/index.xml`, {
          params: { key: this.apiKey, q: 'test', per_page: 1 },
          timeout: 5000,
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Goodreads API is not available: ${error.message}`);
      return false;
    }
  }

  private buildSearchQuery(query: MetadataSearchQuery): string {
    const parts: string[] = [];

    if (query.title) {
      parts.push(query.title);
    }

    if (query.author) {
      parts.push(query.author);
    }

    if (query.isbn) {
      parts.push(query.isbn.replace(/[-\s]/g, ''));
    }

    return parts.length > 0 ? parts.join(' ') : 'books';
  }

  private async parseSearchResults(xmlData: string): Promise<ExternalMetadata[]> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const search = result?.GoodreadsResponse?.search;
      if (!search || !search.results || !search.results.work) {
        return [];
      }

      const works = Array.isArray(search.results.work)
        ? search.results.work
        : [search.results.work];

      return works.map((work: any) => this.parseWorkItem(work)).filter(Boolean);
    } catch (error) {
      this.logger.error(`Error parsing Goodreads search results: ${error.message}`);
      return [];
    }
  }

  private async parseBookDetails(xmlData: string): Promise<ExternalMetadata | null> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const book = result?.GoodreadsResponse?.book;
      if (!book) {
        return null;
      }

      return this.parseBookItem(book);
    } catch (error) {
      this.logger.error(`Error parsing Goodreads book details: ${error.message}`);
      return null;
    }
  }

  private parseWorkItem(work: any): ExternalMetadata | null {
    try {
      const bestBook = work.best_book;
      if (!bestBook) return null;

      // Calculate confidence based on available data
      let confidence = 0.6; // Base confidence for Goodreads
      if (bestBook.title) confidence += 0.1;
      if (bestBook.author && bestBook.author.name) confidence += 0.1;
      if (work.average_rating) confidence += 0.1;
      if (work.ratings_count && parseInt(work.ratings_count) > 100) confidence += 0.1;

      const metadata: ExternalMetadata = {
        source: this.name,
        title: bestBook.title || 'Unknown Title',
        author: bestBook.author?.name || 'Unknown Author',
        isbn: undefined, // ISBN not provided in search results
        language: undefined,
        publisher: undefined,
        publishDate: work.original_publication_year
          ? new Date(`${work.original_publication_year}-01-01`)
          : undefined,
        description: undefined, // Not provided in search results
        coverImageUrl: bestBook.image_url,
        genres: undefined,
        rating: work.average_rating ? parseFloat(work.average_rating) : undefined,
        pageCount: undefined,
        confidence: Math.min(confidence, 1.0),
        rawData: work,
      };

      return metadata;
    } catch (error) {
      this.logger.warn(`Error parsing Goodreads work item: ${error.message}`);
      return null;
    }
  }

  private parseBookItem(book: any): ExternalMetadata | null {
    try {
      // Calculate confidence based on available data
      let confidence = 0.7; // Higher base confidence for detailed book data
      if (book.title) confidence += 0.1;
      if (book.authors && book.authors.author) confidence += 0.1;
      if (book.isbn || book.isbn13) confidence += 0.1;
      if (book.description) confidence += 0.1;

      const authors = Array.isArray(book.authors?.author)
        ? book.authors.author.map((a: any) => a.name).join(', ')
        : book.authors?.author?.name || 'Unknown Author';

      const metadata: ExternalMetadata = {
        source: this.name,
        title: book.title || 'Unknown Title',
        author: authors,
        isbn: book.isbn13 || book.isbn,
        language: book.language_code,
        publisher: book.publisher,
        publishDate: book.publication_year
          ? new Date(
              `${book.publication_year}-${book.publication_month || '01'}-${book.publication_day || '01'}`,
            )
          : undefined,
        description: book.description,
        coverImageUrl: book.image_url,
        genres: book.popular_shelves?.shelf
          ? Array.isArray(book.popular_shelves.shelf)
            ? book.popular_shelves.shelf.map((s: any) => s.$.name)
            : [book.popular_shelves.shelf.$.name]
          : undefined,
        rating: book.average_rating ? parseFloat(book.average_rating) : undefined,
        pageCount: book.num_pages ? parseInt(book.num_pages) : undefined,
        confidence: Math.min(confidence, 1.0),
        rawData: book,
      };

      return metadata;
    } catch (error) {
      this.logger.warn(`Error parsing Goodreads book item: ${error.message}`);
      return null;
    }
  }
}
