import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import {
  MetadataProvider,
  MetadataSearchQuery,
  MetadataSearchResult,
  ExternalMetadata,
  MetadataSource,
} from '../interfaces/metadata.interface';

@Injectable()
export class AmazonProvider implements MetadataProvider {
  private readonly logger = new Logger(AmazonProvider.name);
  readonly name = MetadataSource.AMAZON;
  private readonly baseUrl = 'https://webservices.amazon.com/onca/xml';
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly associateTag: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.accessKey = this.configService.get<string>('AMAZON_ACCESS_KEY');
    this.secretKey = this.configService.get<string>('AMAZON_SECRET_KEY');
    this.associateTag = this.configService.get<string>('AMAZON_ASSOCIATE_TAG');
  }

  async search(query: MetadataSearchQuery): Promise<MetadataSearchResult> {
    try {
      if (!this.isConfigured()) {
        this.logger.warn('Amazon API credentials not configured');
        return {
          results: [],
          totalResults: 0,
          source: this.name,
          query,
        };
      }

      const searchQuery = this.buildSearchQuery(query);
      const params = this.buildSearchParams(searchQuery);
      const signedUrl = this.signRequest(params);

      this.logger.debug(`Searching Amazon with query: ${searchQuery}`);

      const response = await firstValueFrom(this.httpService.get<string>(signedUrl));

      const results = await this.parseSearchResults(response.data);

      return {
        results,
        totalResults: results.length, // Amazon doesn't provide total count in this format
        source: this.name,
        query,
      };
    } catch (error) {
      this.logger.error(`Error searching Amazon: ${error.message}`);
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
      if (!this.isConfigured()) {
        this.logger.warn('Amazon API credentials not configured');
        return null;
      }

      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      const params = this.buildIsbnParams(cleanIsbn);
      const signedUrl = this.signRequest(params);

      this.logger.debug(`Searching Amazon by ISBN: ${cleanIsbn}`);

      const response = await firstValueFrom(this.httpService.get<string>(signedUrl));

      const results = await this.parseSearchResults(response.data);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      this.logger.error(`Error searching Amazon by ISBN: ${error.message}`);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      // Test with a simple search
      const params = this.buildSearchParams('test');
      const signedUrl = this.signRequest(params);

      const response = await firstValueFrom(
        this.httpService.get<any>(signedUrl, { timeout: 5000 }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Amazon API is not available: ${error.message}`);
      return false;
    }
  }

  private isConfigured(): boolean {
    return !!(this.accessKey && this.secretKey && this.associateTag);
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
      return query.isbn.replace(/[-\s]/g, ''); // For ISBN, use it directly
    }

    return parts.length > 0 ? parts.join(' ') : 'books';
  }

  private buildSearchParams(searchQuery: string): Record<string, string> {
    return {
      Service: 'AWSECommerceService',
      Operation: 'ItemSearch',
      AWSAccessKeyId: this.accessKey,
      AssociateTag: this.associateTag,
      SearchIndex: 'Books',
      Keywords: searchQuery,
      ResponseGroup: 'ItemAttributes,Images',
      Version: '2013-08-01',
      Timestamp: new Date().toISOString(),
    };
  }

  private buildIsbnParams(isbn: string): Record<string, string> {
    return {
      Service: 'AWSECommerceService',
      Operation: 'ItemLookup',
      AWSAccessKeyId: this.accessKey,
      AssociateTag: this.associateTag,
      ItemId: isbn,
      IdType: 'ISBN',
      SearchIndex: 'Books',
      ResponseGroup: 'ItemAttributes,Images',
      Version: '2013-08-01',
      Timestamp: new Date().toISOString(),
    };
  }

  private signRequest(params: Record<string, string>): string {
    // Sort parameters
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create string to sign
    const stringToSign = `GET\nwebservices.amazon.com\n/onca/xml\n${sortedParams}`;

    // Create signature
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(stringToSign)
      .digest('base64');

    // Return signed URL
    return `${this.baseUrl}?${sortedParams}&Signature=${encodeURIComponent(signature)}`;
  }

  private async parseSearchResults(_xmlData: string): Promise<ExternalMetadata[]> {
    try {
      // Note: Amazon's Product Advertising API was deprecated and replaced
      // This is a placeholder implementation for the new API structure
      // In practice, you would need to use the new Amazon PA API 5.0

      this.logger.warn(
        'Amazon Product Advertising API implementation needs updating to PA API 5.0',
      );

      // For now, return empty results
      return [];
    } catch (error) {
      this.logger.error(`Error parsing Amazon search results: ${error.message}`);
      return [];
    }
  }

  private parseBookItem(item: any): ExternalMetadata | null {
    try {
      const attributes = item.ItemAttributes;
      if (!attributes) return null;

      // Calculate confidence based on available data
      let confidence = 0.5; // Base confidence
      if (attributes.Title) confidence += 0.2;
      if (attributes.Author) confidence += 0.2;
      if (attributes.ISBN || attributes.EAN) confidence += 0.1;
      if (attributes.Publisher) confidence += 0.1;

      const metadata: ExternalMetadata = {
        source: this.name,
        title: attributes.Title || 'Unknown Title',
        author: Array.isArray(attributes.Author)
          ? attributes.Author.join(', ')
          : attributes.Author || 'Unknown Author',
        isbn: attributes.ISBN || attributes.EAN,
        language: attributes.Languages?.Language?.Name,
        publisher: attributes.Publisher,
        publishDate: attributes.PublicationDate ? new Date(attributes.PublicationDate) : undefined,
        description: attributes.Feature ? attributes.Feature.join(' ') : undefined,
        coverImageUrl: item.LargeImage?.URL || item.MediumImage?.URL || item.SmallImage?.URL,
        genres: attributes.Binding ? [attributes.Binding] : undefined,
        rating: undefined, // Amazon doesn't provide ratings in this API
        pageCount: attributes.NumberOfPages ? parseInt(attributes.NumberOfPages) : undefined,
        confidence: Math.min(confidence, 1.0),
        rawData: item,
      };

      return metadata;
    } catch (error) {
      this.logger.warn(`Error parsing Amazon book item: ${error.message}`);
      return null;
    }
  }
}
