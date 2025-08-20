import { Test, TestingModule } from '@nestjs/testing';
import { CbxParser } from './cbx.parser';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock yauzl
vi.mock('yauzl');
vi.mock('fs');
vi.mock('sharp', () => ({
  default: vi.fn().mockImplementation(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('thumbnail-data')),
  })),
}));

describe('CbxParser', () => {
  let parser: CbxParser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CbxParser],
    }).compile();

    parser = module.get<CbxParser>(CbxParser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parse', () => {
    it('should parse a CBZ file successfully', async () => {
      const filePath = '/test/comic.cbz';
      const mockPages = ['page001.jpg', 'page002.jpg', 'page003.jpg'];

      // Mock fs.existsSync
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock yauzl.open
      const mockZipfile = {
        readEntry: vi.fn(),
        on: vi.fn(),
        openReadStream: vi.fn(),
      };

      vi.mocked(yauzl.open as any).mockImplementation((path, options, callback) => {
        callback(null, mockZipfile);
      });

      // Mock zipfile events
      mockZipfile.on.mockImplementation((event, handler) => {
        if (event === 'entry') {
          // Simulate entries
          mockPages.forEach(page => {
            handler({ fileName: page });
          });
        } else if (event === 'end') {
          handler();
        }
      });

      // Mock openReadStream for cover extraction
      const mockReadStream = {
        on: vi.fn(),
      };
      
      mockZipfile.openReadStream.mockImplementation((entry, callback) => {
        callback(null, mockReadStream);
      });

      mockReadStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          // Simulate image data chunks
          handler(Buffer.from('fake-image-data'));
        } else if (event === 'end') {
          handler();
        }
      });

      const result = await parser.parse(filePath);

      expect(result).toBeDefined();
      expect(result.title).toBe('comic');
      expect(result.format).toBe('cbx');
      expect(result.pageCount).toBe(3);
      expect(result.chapters).toHaveLength(3);
      expect(result.chapters[0].title).toBe('Page 1');
      expect(result.chapters[0].href).toBe('page001.jpg');
    });

    it('should throw error for non-existent file', async () => {
      const filePath = '/test/nonexistent.cbz';
      
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(parser.parse(filePath)).rejects.toThrow('CBX file not found');
    });

    it('should throw error for unsupported format', async () => {
      const filePath = '/test/book.txt';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(parser.parse(filePath)).rejects.toThrow('Unsupported CBX format');
    });

    it('should throw error for RAR format (not implemented)', async () => {
      const filePath = '/test/comic.cbr';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(parser.parse(filePath)).rejects.toThrow('RAR format support not implemented yet');
    });

    it('should throw error for 7Z format (not implemented)', async () => {
      const filePath = '/test/comic.cb7';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(parser.parse(filePath)).rejects.toThrow('7Z format support not implemented yet');
    });
  });

  describe('validateCbxFile', () => {
    it('should return true for valid CBZ file', async () => {
      const filePath = '/test/comic.cbz';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock yauzl.open for validation
      const mockZipfile = {
        readEntry: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };

      vi.mocked(yauzl.open as any).mockImplementation((path, options, callback) => {
        callback(null, mockZipfile);
      });

      mockZipfile.on.mockImplementation((event, handler) => {
        if (event === 'entry') {
          handler({ fileName: 'page001.jpg' });
        } else if (event === 'end') {
          handler();
        }
      });

      const result = await parser.validateCbxFile(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const filePath = '/test/nonexistent.cbz';
      
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await parser.validateCbxFile(filePath);
      expect(result).toBe(false);
    });

    it('should return false for unsupported format', async () => {
      const filePath = '/test/book.txt';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await parser.validateCbxFile(filePath);
      expect(result).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('should return correct file info for CBZ', async () => {
      const filePath = '/test/comic.cbz';
      const mockStats = { 
        size: 1024000,
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
        atimeMs: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        birthtimeMs: 0,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date(),
        birthtime: new Date()
      } as any;
      
      vi.mocked(fs.statSync).mockReturnValue(mockStats);

      const result = await parser.getFileInfo(filePath);
      
      expect(result.size).toBe(1024000);
      expect(result.mimeType).toBe('application/vnd.comicbook+zip');
    });

    it('should return correct file info for CBR', async () => {
      const filePath = '/test/comic.cbr';
      const mockStats = { 
        size: 2048000,
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
        atimeMs: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        birthtimeMs: 0,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date(),
        birthtime: new Date()
      } as any;
      
      vi.mocked(fs.statSync).mockReturnValue(mockStats);

      const result = await parser.getFileInfo(filePath);
      
      expect(result.size).toBe(2048000);
      expect(result.mimeType).toBe('application/vnd.comicbook-rar');
    });

    it('should return correct file info for CB7', async () => {
      const filePath = '/test/comic.cb7';
      const mockStats = { 
        size: 1536000,
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
        atimeMs: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        birthtimeMs: 0,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date(),
        birthtime: new Date()
      } as any;
      
      vi.mocked(fs.statSync).mockReturnValue(mockStats);

      const result = await parser.getFileInfo(filePath);
      
      expect(result.size).toBe(1536000);
      expect(result.mimeType).toBe('application/x-cb7');
    });
  });

  describe('private methods', () => {
    it('should identify image files correctly', () => {
      // Access private method through any cast for testing
      const parserAny = parser as any;
      
      expect(parserAny.isImageFile('page001.jpg')).toBe(true);
      expect(parserAny.isImageFile('page002.jpeg')).toBe(true);
      expect(parserAny.isImageFile('page003.png')).toBe(true);
      expect(parserAny.isImageFile('page004.gif')).toBe(true);
      expect(parserAny.isImageFile('page005.bmp')).toBe(true);
      expect(parserAny.isImageFile('page006.webp')).toBe(true);
      expect(parserAny.isImageFile('readme.txt')).toBe(false);
      expect(parserAny.isImageFile('metadata.xml')).toBe(false);
    });

    it('should sort pages naturally', () => {
      const parserAny = parser as any;
      const pages = ['page10.jpg', 'page2.jpg', 'page1.jpg', 'page20.jpg'];
      const sorted = pages.sort(parserAny.naturalSort);
      
      expect(sorted).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg', 'page20.jpg']);
    });

    it('should create chapters from pages', () => {
      const parserAny = parser as any;
      const pages = ['page001.jpg', 'page002.jpg', 'page003.jpg'];
      const chapters = parserAny.createChaptersFromPages(pages);
      
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toEqual({
        id: 'page-1',
        title: 'Page 1',
        href: 'page001.jpg',
        order: 0,
        content: null,
      });
      expect(chapters[1]).toEqual({
        id: 'page-2',
        title: 'Page 2',
        href: 'page002.jpg',
        order: 1,
        content: null,
      });
    });
  });
});