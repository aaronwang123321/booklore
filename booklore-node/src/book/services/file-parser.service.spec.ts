import { Test, TestingModule } from '@nestjs/testing';
import { FileParserService } from './file-parser.service';
import { EpubParser } from '../parsers/epub.parser';
import { PdfParser } from '../parsers/pdf.parser';
import { CbxParser } from '../parsers/cbx.parser';
import { BookMetadata } from '../interfaces/book-metadata.interface';
import * as fs from 'fs';
import { vi } from 'vitest';

// Mock fs
vi.mock('fs');

describe('FileParserService', () => {
  let service: FileParserService;
  let epubParser: EpubParser;
  let pdfParser: PdfParser;
  let cbxParser: CbxParser;

  const mockBookMetadata: BookMetadata = {
    title: 'Test Book',
    author: 'Test Author',
    isbn: '978-1234567890',
    language: 'en',
    publisher: 'Test Publisher',
    publishDate: new Date('2023-01-01'),
    description: 'Test Description',
    coverImage: null,
    chapters: [],
    pageCount: 100,
    format: 'epub',
    metadata: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileParserService,
        {
          provide: EpubParser,
          useValue: {
            parse: vi.fn(),
            validateEpubFile: vi.fn(),
          },
        },
        {
          provide: PdfParser,
          useValue: {
            parse: vi.fn(),
            validatePdfFile: vi.fn(),
          },
        },
        {
          provide: CbxParser,
          useValue: {
            parse: vi.fn(),
            validateCbxFile: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FileParserService>(FileParserService);
    epubParser = module.get<EpubParser>(EpubParser);
    pdfParser = module.get<PdfParser>(PdfParser);
    cbxParser = module.get<CbxParser>(CbxParser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseFile', () => {
    it('should parse EPUB file successfully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(epubParser.parse).mockResolvedValue(mockBookMetadata);

      const result = await service.parseFile('/path/to/test.epub');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual(mockBookMetadata);
      expect(epubParser.parse).toHaveBeenCalledWith('/path/to/test.epub');
    });

    it('should parse PDF file successfully', async () => {
      const pdfMetadata = { ...mockBookMetadata, format: 'pdf' as const };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(pdfParser.parse).mockResolvedValue(pdfMetadata);

      const result = await service.parseFile('/path/to/test.pdf');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual(pdfMetadata);
      expect(pdfParser.parse).toHaveBeenCalledWith('/path/to/test.pdf');
    });

    it('should return error if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.parseFile('/path/to/nonexistent.epub');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found: /path/to/nonexistent.epub');
    });

    it('should return error for unsupported file type', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

      const result = await service.parseFile('/path/to/test.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported file type: unknown');
    });

    it('should return error if file exceeds size limit', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2048 } as any);

      const result = await service.parseFile('/path/to/test.epub', { maxFileSize: 1024 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should handle parsing errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(epubParser.parse).mockRejectedValue(new Error('Parsing failed'));

      const result = await service.parseFile('/path/to/test.epub');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parsing failed');
    });
  });

  describe('validateFile', () => {
    it('should validate EPUB file', async () => {
      vi.mocked(epubParser.validateEpubFile).mockResolvedValue(true);

      const result = await service.validateFile('/path/to/test.epub');

      expect(result).toBe(true);
      expect(epubParser.validateEpubFile).toHaveBeenCalledWith('/path/to/test.epub');
    });

    it('should validate PDF file', async () => {
      vi.mocked(pdfParser.validatePdfFile).mockResolvedValue(true);

      const result = await service.validateFile('/path/to/test.pdf');

      expect(result).toBe(true);
      expect(pdfParser.validatePdfFile).toHaveBeenCalledWith('/path/to/test.pdf');
    });

    it('should return false for unsupported file type', async () => {
      const result = await service.validateFile('/path/to/test.txt');

      expect(result).toBe(false);
    });
  });

  describe('getFileType', () => {
    it('should return correct file type for EPUB', () => {
      expect(service.getFileType('/path/to/test.epub')).toBe('epub');
    });

    it('should return correct file type for PDF', () => {
      expect(service.getFileType('/path/to/test.pdf')).toBe('pdf');
    });

    it('should return unknown for unsupported file', () => {
      expect(service.getFileType('/path/to/test.txt')).toBe('unknown');
    });
  });

  describe('getSupportedFormats', () => {
    it('should return list of supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toEqual(['epub', 'pdf', 'cbx']);
    });
  });

  describe('parseMultipleFiles', () => {
    it('should parse multiple files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(epubParser.parse).mockResolvedValue(mockBookMetadata);

      const files = ['/path/to/test1.epub', '/path/to/test2.epub'];
      const results = await service.parseMultipleFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });
});