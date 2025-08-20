import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VersionInfoDto, UpdateInfoDto } from './dto/version.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly packageJson: any;

  constructor(private readonly configService: ConfigService) {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      this.packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } catch (error) {
      this.logger.error('Failed to read package.json', error);
      this.packageJson = { version: '0.0.0', name: 'BookLore' };
    }
  }

  async getVersionInfo(): Promise<VersionInfoDto> {
    const buildTime = this.configService.get<string>('BUILD_TIME') || new Date().toISOString();
    const commitHash = this.configService.get<string>('COMMIT_HASH') || 'unknown';
    const environment = this.configService.get<string>('NODE_ENV') || 'development';

    return {
      version: this.packageJson.version,
      buildTime,
      commitHash,
      appName: this.packageJson.name || 'BookLore',
      environment,
    };
  }

  async getUpdateInfo(): Promise<UpdateInfoDto> {
    try {
      // In a real implementation, this would check GitHub releases or another update source
      // For now, we'll return a mock response
      const currentVersion = this.packageJson.version;

      // Mock update check - in production, this would make an HTTP request to GitHub API
      const mockLatestVersion = await this.checkForUpdates();
      const updateAvailable = this.isNewerVersion(mockLatestVersion, currentVersion);

      return {
        updateAvailable,
        latestVersion: mockLatestVersion,
        currentVersion,
        releaseNotes: updateAvailable
          ? 'New features and bug fixes available'
          : 'You are running the latest version',
        downloadUrl: updateAvailable
          ? `https://github.com/booklore/booklore/releases/tag/v${mockLatestVersion}`
          : '',
        releaseDate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to check for updates', error);
      return {
        updateAvailable: false,
        latestVersion: this.packageJson.version,
        currentVersion: this.packageJson.version,
        releaseNotes: 'Unable to check for updates',
        downloadUrl: '',
        releaseDate: new Date().toISOString(),
      };
    }
  }

  async getChangelog(): Promise<{ changelog: string }> {
    try {
      const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
      if (fs.existsSync(changelogPath)) {
        const changelog = fs.readFileSync(changelogPath, 'utf8');
        return { changelog };
      } else {
        return {
          changelog: `# Changelog\n\n## Version ${this.packageJson.version}\n\n- Initial release\n- Core functionality implemented\n`,
        };
      }
    } catch (error) {
      this.logger.error('Failed to read changelog', error);
      return {
        changelog: `# Changelog\n\n## Version ${this.packageJson.version}\n\n- Unable to load changelog\n`,
      };
    }
  }

  private async checkForUpdates(): Promise<string> {
    // Mock implementation - in production, this would check GitHub releases
    // Example: GET https://api.github.com/repos/owner/repo/releases/latest

    // For now, return the current version (no updates available)
    return this.packageJson.version;
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const parseVersion = (version: string) => {
      return version.split('.').map(num => parseInt(num, 10));
    };

    const latestParts = parseVersion(latest);
    const currentParts = parseVersion(current);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latestPart = latestParts[i] || 0;
      const currentPart = currentParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }
}
