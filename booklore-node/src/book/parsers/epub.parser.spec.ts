import { Test, TestingModule } from '@nestjs/testing';
import { EpubParser } from './epub.parser';
import * as fs from 'fs';
import { vi } from 'vitest';

// Mock fs
vi.mock('fs');

// No need to mock epub2 since we're using a stub implementation

describe('EpubParser', () => {
  let parser: EpubParser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EpubParser],
    }).compile();

    parser = module.get<EpubParser>(EpubParser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parse', () => {
    it('should parse EPUB file successfully', async () => {
      // Mock file existence
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await parser.parse('/path/to/test.epub');

      expect(result).toEqual({
        title: 'test',
        author: 'Unknown Author',
        isbn: null,
        language: 'en',
        publisher: null,
        publishDate: null,
        description: 'EPUB file: test',
        coverImage: null,
        chapters: [
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
        ],
        pageCount: 2,
        format: 'epub',
        metadata: expect.any(Object),
      });
    });

    it('should throw error if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(parser.parse('/path/to/nonexistent.epub')).rejects.toThrow(
        'Failed to parse EPUB file: EPUB file not found: /path/to/nonexistent.epub'
      );
    });

    it('should handle parsing errors gracefully', async () => {
      // Mock fs.existsSync to throw an error
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      await expect(parser.parse('/path/to/invalid.epub')).rejects.toThrow(
        'Failed to parse EPUB file: File system error'
      );
    });
  });

  describe('validateEpubFile', () => {
    it('should return true for valid EPUB file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = await parser.validateEpubFile('/path/to/valid.epub');

      expect(result).toBe(true);
    });

    it('should return false for invalid EPUB file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await parser.validateEpubFile('/path/to/invalid.epub');

      expect(result).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('should return file info', async () => {
      const mockStats = {
        size: 1024000,
      };
      vi.mocked(fs.statSync).mockReturnValue(mockStats as any);

      const result = await parser.getFileInfo('/path/to/test.epub');

      expect(result).toEqual({
        size: 1024000,
        mimeType: 'application/epub+zip',
      });
    });
  });
});