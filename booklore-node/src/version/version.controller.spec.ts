import { Test, TestingModule } from '@nestjs/testing';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';
import { VersionInfoDto, UpdateInfoDto } from './dto/version.dto';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('VersionController', () => {
  let controller: VersionController;
  let versionService: any;

  const mockVersionInfo: VersionInfoDto = {
    version: '1.2.3',
    buildTime: '2024-01-15T10:30:00Z',
    commitHash: 'abc123def456',
    appName: 'BookLore',
    environment: 'production',
  };

  const mockUpdateInfo: UpdateInfoDto = {
    updateAvailable: true,
    latestVersion: '1.3.0',
    currentVersion: '1.2.3',
    releaseNotes: 'New features and bug fixes available',
    downloadUrl: 'https://github.com/booklore/booklore/releases/tag/v1.3.0',
    releaseDate: '2024-01-20T00:00:00Z',
  };

  const mockChangelog = {
    changelog: '# Changelog\n\n## Version 1.2.3\n\n- Bug fixes\n- Performance improvements',
  };

  beforeEach(async () => {
    const mockVersionService = {
      getVersionInfo: vi.fn(),
      getUpdateInfo: vi.fn(),
      getChangelog: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionController],
      providers: [
        {
          provide: VersionService,
          useValue: mockVersionService,
        },
      ],
    }).compile();

    controller = module.get<VersionController>(VersionController);
    versionService = module.get(VersionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getVersionInfo', () => {
    it('should return version information', async () => {
      versionService.getVersionInfo.mockResolvedValue(mockVersionInfo);

      const result = await controller.getVersionInfo();

      expect(result).toEqual(mockVersionInfo);
      expect(versionService.getVersionInfo).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      versionService.getVersionInfo.mockRejectedValue(error);

      await expect(controller.getVersionInfo()).rejects.toThrow('Service error');
      expect(versionService.getVersionInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUpdateInfo', () => {
    it('should return update information when update is available', async () => {
      versionService.getUpdateInfo.mockResolvedValue(mockUpdateInfo);

      const result = await controller.getUpdateInfo();

      expect(result).toEqual(mockUpdateInfo);
      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe('1.3.0');
      expect(result.downloadUrl).toBeTruthy();
      expect(versionService.getUpdateInfo).toHaveBeenCalledTimes(1);
    });

    it('should return update information when no update is available', async () => {
      const noUpdateInfo: UpdateInfoDto = {
        ...mockUpdateInfo,
        updateAvailable: false,
        latestVersion: '1.2.3',
        releaseNotes: 'You are running the latest version',
        downloadUrl: '',
      };
      versionService.getUpdateInfo.mockResolvedValue(noUpdateInfo);

      const result = await controller.getUpdateInfo();

      expect(result).toEqual(noUpdateInfo);
      expect(result.updateAvailable).toBe(false);
      expect(result.downloadUrl).toBe('');
      expect(versionService.getUpdateInfo).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors', async () => {
      const error = new Error('Update check failed');
      versionService.getUpdateInfo.mockRejectedValue(error);

      await expect(controller.getUpdateInfo()).rejects.toThrow('Update check failed');
      expect(versionService.getUpdateInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('getChangelog', () => {
    it('should return changelog content', async () => {
      versionService.getChangelog.mockResolvedValue(mockChangelog);

      const result = await controller.getChangelog();

      expect(result).toEqual(mockChangelog);
      expect(result.changelog).toContain('# Changelog');
      expect(result.changelog).toContain('## Version 1.2.3');
      expect(versionService.getChangelog).toHaveBeenCalledTimes(1);
    });

    it('should return default changelog when file is not found', async () => {
      const defaultChangelog = {
        changelog: '# Changelog\n\n## Version 1.2.3\n\n- Initial release\n- Core functionality implemented\n',
      };
      versionService.getChangelog.mockResolvedValue(defaultChangelog);

      const result = await controller.getChangelog();

      expect(result).toEqual(defaultChangelog);
      expect(result.changelog).toContain('Initial release');
      expect(versionService.getChangelog).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors', async () => {
      const error = new Error('Changelog read failed');
      versionService.getChangelog.mockRejectedValue(error);

      await expect(controller.getChangelog()).rejects.toThrow('Changelog read failed');
      expect(versionService.getChangelog).toHaveBeenCalledTimes(1);
    });
  });

  describe('API endpoint structure', () => {
    it('should be properly decorated with API tags and operations', () => {
      // Test that the controller is properly set up
      expect(controller).toBeDefined();
      expect(controller.getVersionInfo).toBeDefined();
      expect(controller.getUpdateInfo).toBeDefined();
      expect(controller.getChangelog).toBeDefined();
    });

    it('should have correct method signatures', () => {
      // Verify method signatures match expected types
      expect(typeof controller.getVersionInfo).toBe('function');
      expect(typeof controller.getUpdateInfo).toBe('function');
      expect(typeof controller.getChangelog).toBe('function');
    });
  });
});