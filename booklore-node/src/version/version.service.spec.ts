import { Test, TestingModule } from '@nestjs/testing';
import { VersionService } from './version.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock fs module
vi.mock('fs');
const mockedFs = fs as any;

// Mock path module
vi.mock('path');
const mockedPath = path as any;

describe('VersionService', () => {
  let service: VersionService;
  let configService: any;

  const mockPackageJson = {
    name: 'booklore-test',
    version: '1.2.3',
    description: 'Test package',
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<VersionService>(VersionService);
    configService = module.get(ConfigService);

    // Setup default mocks
    mockedPath.join.mockReturnValue('/mock/path/package.json');
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should read package.json successfully', () => {
      expect(mockedPath.join).toHaveBeenCalledWith(process.cwd(), 'package.json');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/mock/path/package.json', 'utf8');
    });

    it('should handle package.json read error gracefully', () => {
      // Create a new instance with mocked error
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      // Create new service instance to trigger constructor
      const module = Test.createTestingModule({
        providers: [
          VersionService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      expect(loggerSpy).toHaveBeenCalledWith('Failed to read package.json', expect.any(Error));
      loggerSpy.mockRestore();
    });
  });

  describe('getVersionInfo', () => {
    it('should return version info with all config values', async () => {
      configService.get
        .mockReturnValueOnce('2024-01-15T10:30:00Z') // BUILD_TIME
        .mockReturnValueOnce('abc123def456') // COMMIT_HASH
        .mockReturnValueOnce('production'); // NODE_ENV

      const result = await service.getVersionInfo();

      expect(result).toEqual({
        version: '1.2.3',
        buildTime: '2024-01-15T10:30:00Z',
        commitHash: 'abc123def456',
        appName: 'booklore-test',
        environment: 'production',
      });
    });

    it('should return version info with default values when config is missing', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await service.getVersionInfo();

      expect(result).toEqual({
        version: '1.2.3',
        buildTime: expect.any(String), // Should be current ISO string
        commitHash: 'unknown',
        appName: 'booklore-test',
        environment: 'development',
      });

      // Verify buildTime is a valid ISO string
      expect(new Date(result.buildTime).toISOString()).toBe(result.buildTime);
    });

    it('should handle missing package name gracefully', async () => {
      // Mock package.json without name
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
      configService.get.mockReturnValue(undefined);

      // Create new service instance
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VersionService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<VersionService>(VersionService);
      const result = await newService.getVersionInfo();

      expect(result.appName).toBe('BookLore');
    });
  });

  describe('getUpdateInfo', () => {
    it('should return update info when no update is available', async () => {
      const result = await service.getUpdateInfo();

      expect(result).toEqual({
        updateAvailable: false,
        latestVersion: '1.2.3',
        currentVersion: '1.2.3',
        releaseNotes: 'You are running the latest version',
        downloadUrl: '',
        releaseDate: expect.any(String),
      });

      // Verify releaseDate is a valid ISO string
      expect(new Date(result.releaseDate).toISOString()).toBe(result.releaseDate);
    });

    it('should handle update check error gracefully', async () => {
      const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      
      // Mock checkForUpdates to throw error by mocking the private method indirectly
      vi.spyOn(service as any, 'checkForUpdates').mockRejectedValue(new Error('Network error'));

      const result = await service.getUpdateInfo();

      expect(result).toEqual({
        updateAvailable: false,
        latestVersion: '1.2.3',
        currentVersion: '1.2.3',
        releaseNotes: 'Unable to check for updates',
        downloadUrl: '',
        releaseDate: expect.any(String),
      });

      expect(loggerSpy).toHaveBeenCalledWith('Failed to check for updates', expect.any(Error));
      loggerSpy.mockRestore();
    });
  });

  describe('getChangelog', () => {
    it('should return changelog when file exists', async () => {
      const mockChangelog = '# Changelog\n\n## v1.2.3\n- Bug fixes';
      mockedPath.join.mockReturnValue('/mock/path/CHANGELOG.md');
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(mockChangelog);

      const result = await service.getChangelog();

      expect(result).toEqual({
        changelog: mockChangelog,
      });
      expect(mockedPath.join).toHaveBeenCalledWith(process.cwd(), 'CHANGELOG.md');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/mock/path/CHANGELOG.md');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/mock/path/CHANGELOG.md', 'utf8');
    });

    it('should return default changelog when file does not exist', async () => {
      mockedPath.join.mockReturnValue('/mock/path/CHANGELOG.md');
      mockedFs.existsSync.mockReturnValue(false);

      const result = await service.getChangelog();

      expect(result.changelog).toContain('# Changelog');
      expect(result.changelog).toContain('## Version 1.2.3');
      expect(result.changelog).toContain('- Initial release');
      expect(result.changelog).toContain('- Core functionality implemented');
    });

    it('should handle file read error gracefully', async () => {
      const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      mockedPath.join.mockReturnValue('/mock/path/CHANGELOG.md');
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await service.getChangelog();

      expect(result.changelog).toContain('# Changelog');
      expect(result.changelog).toContain('## Version 1.2.3');
      expect(result.changelog).toContain('- Unable to load changelog');
      expect(loggerSpy).toHaveBeenCalledWith('Failed to read changelog', expect.any(Error));
      loggerSpy.mockRestore();
    });
  });

  describe('isNewerVersion (private method)', () => {
    it('should correctly compare version numbers', () => {
      // Access private method for testing
      const isNewerVersion = (service as any).isNewerVersion.bind(service);

      // Test cases for version comparison
      expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
      expect(isNewerVersion('1.3.0', '1.2.9')).toBe(true);
      expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
      expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
      expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false);
      expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
      expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
    });

    it('should handle versions with different number of parts', () => {
      const isNewerVersion = (service as any).isNewerVersion.bind(service);

      expect(isNewerVersion('1.2.3.1', '1.2.3')).toBe(true);
      expect(isNewerVersion('1.2', '1.2.0')).toBe(false);
      expect(isNewerVersion('1.2.0', '1.2')).toBe(false);
    });
  });

  describe('checkForUpdates (private method)', () => {
    it('should return current version (mock implementation)', async () => {
      const checkForUpdates = (service as any).checkForUpdates.bind(service);
      
      const result = await checkForUpdates();
      
      expect(result).toBe('1.2.3');
    });
  });
});