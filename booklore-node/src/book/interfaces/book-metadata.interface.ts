export interface BookMetadata {
  title: string;
  author: string;
  isbn?: string | null;
  language?: string | null;
  publisher?: string | null;
  publishDate?: Date | null;
  description?: string | null;
  coverImage?: string | null;
  chapters: Chapter[];
  pageCount: number;
  format: 'epub' | 'pdf' | 'cbx';
  metadata?: any;
}

export interface Chapter {
  id: string;
  title: string;
  href: string;
  order: number;
  content?: string | null;
}

export interface ParseResult {
  success: boolean;
  metadata?: BookMetadata;
  error?: string;
}

export interface FileInfo {
  size: number;
  mimeType: string;
  extension: string;
}

export interface ParserOptions {
  extractCover?: boolean;
  extractChapters?: boolean;
  maxFileSize?: number;
  timeout?: number;
}
