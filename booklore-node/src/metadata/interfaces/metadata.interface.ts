export interface ExternalMetadata {
  source: MetadataSource;
  title: string;
  author: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishDate?: Date;
  description?: string;
  coverImageUrl?: string;
  genres?: string[];
  rating?: number;
  pageCount?: number;
  confidence: number; // 0-1 confidence score for matching
  rawData?: any; // Original response from the provider
}

export interface MetadataSearchQuery {
  title?: string;
  author?: string;
  isbn?: string;
  language?: string;
  year?: number;
}

export interface MetadataSearchResult {
  results: ExternalMetadata[];
  totalResults: number;
  source: MetadataSource;
  query: MetadataSearchQuery;
}

export interface MetadataMatchResult {
  bestMatch: ExternalMetadata | null;
  allMatches: ExternalMetadata[];
  confidence: number;
  reasoning: string[];
}

export interface MetadataHistory {
  id: number;
  bookId: number;
  fieldName: string;
  oldValue: any;
  newValue: any;
  source: MetadataSource | 'manual';
  userId: number;
  timestamp: Date;
  reason?: string;
}

export interface MetadataTemplate {
  id: number;
  name: string;
  description?: string;
  fields: MetadataTemplateField[];
  userId: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetadataTemplateField {
  fieldName: string;
  defaultValue?: any;
  required: boolean;
  validation?: string; // regex pattern
  transformation?: string; // transformation rule
}

export interface BulkMetadataUpdate {
  bookIds: number[];
  updates: Partial<BookMetadataUpdate>;
  templateId?: number;
  source: MetadataSource | 'manual';
  userId: number;
}

export interface BookMetadataUpdate {
  title?: string;
  author?: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishDate?: Date;
  description?: string;
  coverImageUrl?: string;
  genres?: string[];
  rating?: number;
  pageCount?: number;
}

export interface MetadataProvider {
  name: MetadataSource;
  search(query: MetadataSearchQuery): Promise<MetadataSearchResult>;
  getByIsbn(isbn: string): Promise<ExternalMetadata | null>;
  isAvailable(): Promise<boolean>;
}

export enum MetadataSource {
  GOOGLE_BOOKS = 'google_books',
  GOODREADS = 'goodreads',
  AMAZON = 'amazon',
  MANUAL = 'manual',
  FILE_PARSER = 'file_parser',
}

export interface MetadataRefreshConfig {
  sources: MetadataSource[];
  maxAge: number; // in days
  autoRefresh: boolean;
  refreshInterval: number; // in hours
}

export interface MetadataValidationRule {
  field: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customValidator?: (value: any) => boolean;
}
