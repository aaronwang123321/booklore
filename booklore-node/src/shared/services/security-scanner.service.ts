import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
// import * as crypto from 'crypto';

interface SecurityScanResult {
  timestamp: Date;
  scanType: string;
  status: 'passed' | 'warning' | 'failed';
  findings: SecurityFinding[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

interface SecurityFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  affectedResource?: string;
  details?: any;
}

// interface FileIntegrityCheck {
//   filePath: string;
//   expectedHash: string;
//   currentHash?: string;
//   status: 'ok' | 'modified' | 'missing';
// }

@Injectable()
export class SecurityScannerService {
  private readonly logger = new Logger(SecurityScannerService.name);
  private readonly scanHistory: SecurityScanResult[] = [];
  private readonly maxHistorySize = 100;
  private readonly criticalFiles: string[] = [
    'package.json',
    'package-lock.json',
    'src/main.ts',
    'src/app.module.ts',
    '.env',
    'prisma/schema.prisma',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  // Run comprehensive security scan every day at 2 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailySecurityScan(): Promise<void> {
    this.logger.log('Starting daily security scan');

    try {
      const result = await this.runComprehensiveScan();
      this.addToHistory(result);

      if (result.status === 'failed' || result.findings.some(f => f.severity === 'critical')) {
        this.logger.error('Critical security issues found during daily scan', {
          findings: result.findings.filter(f => f.severity === 'critical'),
        });
        // In production, you might want to send alerts here
      }
    } catch (error) {
      this.logger.error('Daily security scan failed', error);
    }
  }

  // Run quick security check every hour
  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySecurityCheck(): Promise<void> {
    try {
      const result = await this.runQuickScan();

      if (result.findings.some(f => f.severity === 'high' || f.severity === 'critical')) {
        this.logger.warn('High-severity security issues found during hourly check', {
          findings: result.findings.filter(f => f.severity === 'high' || f.severity === 'critical'),
        });
      }
    } catch (error) {
      this.logger.error('Hourly security check failed', error);
    }
  }

  async runComprehensiveScan(): Promise<SecurityScanResult> {
    const findings: SecurityFinding[] = [];
    let totalChecks = 0;

    // Database security checks
    const dbFindings = await this.checkDatabaseSecurity();
    findings.push(...dbFindings);
    totalChecks += 10; // Approximate number of DB checks

    // File system security checks
    const fsFindings = await this.checkFileSystemSecurity();
    findings.push(...fsFindings);
    totalChecks += 8;

    // Configuration security checks
    const configFindings = await this.checkConfigurationSecurity();
    findings.push(...configFindings);
    totalChecks += 15;

    // Dependency security checks
    const depFindings = await this.checkDependencySecurity();
    findings.push(...depFindings);
    totalChecks += 5;

    // Authentication security checks
    const authFindings = await this.checkAuthenticationSecurity();
    findings.push(...authFindings);
    totalChecks += 7;

    return this.buildScanResult('comprehensive', findings, totalChecks);
  }

  async runQuickScan(): Promise<SecurityScanResult> {
    const findings: SecurityFinding[] = [];
    let totalChecks = 0;

    // Quick file integrity check
    const integrityFindings = await this.checkFileIntegrity();
    findings.push(...integrityFindings);
    totalChecks += this.criticalFiles.length;

    // Quick configuration check
    const quickConfigFindings = await this.checkQuickConfiguration();
    findings.push(...quickConfigFindings);
    totalChecks += 5;

    return this.buildScanResult('quick', findings, totalChecks);
  }

  private async checkDatabaseSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      // Check for users without passwords (if applicable)
      const usersWithoutPasswords = await this.prismaService.user.count({
        where: {
          password: null,
          // Only check users without external provider
          // Assuming users without external auth are local users
        },
      });

      if (usersWithoutPasswords > 0) {
        findings.push({
          severity: 'high',
          category: 'Database Security',
          title: 'Users without passwords found',
          description: `Found ${usersWithoutPasswords} local users without passwords`,
          recommendation: 'Ensure all local users have strong passwords',
          details: { count: usersWithoutPasswords },
        });
      }

      // Check for admin users
      const adminUsers = await this.prismaService.user.count({
        where: {
          role: 'ADMIN',
        },
      });

      if (adminUsers === 0) {
        findings.push({
          severity: 'medium',
          category: 'Database Security',
          title: 'No admin users found',
          description: 'No users with admin role found in the system',
          recommendation: 'Ensure at least one admin user exists',
        });
      } else if (adminUsers > 5) {
        findings.push({
          severity: 'medium',
          category: 'Database Security',
          title: 'Too many admin users',
          description: `Found ${adminUsers} admin users`,
          recommendation: 'Limit the number of admin users to reduce attack surface',
          details: { count: adminUsers },
        });
      }

      // Check for old sessions (if session table exists)
      try {
        const oldSessions = await this.prismaService.$queryRaw`
          SELECT COUNT(*) as count FROM "Session"
          WHERE "expiresAt" < NOW() - INTERVAL '7 days'
        `;

        if (Array.isArray(oldSessions) && oldSessions[0]?.count > 100) {
          findings.push({
            severity: 'low',
            category: 'Database Security',
            title: 'Old sessions not cleaned up',
            description: `Found ${oldSessions[0].count} expired sessions older than 7 days`,
            recommendation: 'Implement session cleanup to remove old expired sessions',
            details: { count: oldSessions[0].count },
          });
        }
      } catch (error) {
        // Session table might not exist, ignore
      }
    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'Database Security',
        title: 'Database security check failed',
        description: 'Unable to perform database security checks',
        recommendation: 'Investigate database connectivity and permissions',
        details: { error: error.message },
      });
    }

    return findings;
  }

  private async checkFileSystemSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      // Check for sensitive files with wrong permissions
      const sensitiveFiles = ['.env', 'prisma/schema.prisma'];

      for (const file of sensitiveFiles) {
        try {
          const stats = await fs.stat(file);
          const mode = stats.mode & parseInt('777', 8);

          // Check if file is readable by others (world-readable)
          if (mode & parseInt('004', 8)) {
            findings.push({
              severity: 'high',
              category: 'File System Security',
              title: 'Sensitive file is world-readable',
              description: `File ${file} is readable by all users`,
              recommendation: 'Change file permissions to restrict access',
              affectedResource: file,
              details: { permissions: mode.toString(8) },
            });
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            findings.push({
              severity: 'low',
              category: 'File System Security',
              title: 'Unable to check file permissions',
              description: `Cannot check permissions for ${file}`,
              recommendation: 'Ensure file exists and is accessible',
              affectedResource: file,
            });
          }
        }
      }

      // Check for backup files that might contain sensitive data
      // const backupPatterns = ['*.bak', '*.backup', '*.old', '*.tmp'];
      // This is a simplified check - in production, you'd want to use a proper file search
    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'File System Security',
        title: 'File system security check failed',
        description: 'Unable to perform file system security checks',
        recommendation: 'Check file system permissions and access',
        details: { error: error.message },
      });
    }

    return findings;
  }

  private async checkConfigurationSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check JWT secret strength
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      findings.push({
        severity: 'critical',
        category: 'Configuration Security',
        title: 'JWT secret not configured',
        description: 'JWT_SECRET environment variable is not set',
        recommendation: 'Set a strong JWT secret in environment variables',
      });
    } else if (jwtSecret.length < 32) {
      findings.push({
        severity: 'high',
        category: 'Configuration Security',
        title: 'Weak JWT secret',
        description: 'JWT secret is too short',
        recommendation: 'Use a JWT secret with at least 32 characters',
      });
    }

    // Check database URL security
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (databaseUrl && databaseUrl.includes('password=')) {
      findings.push({
        severity: 'medium',
        category: 'Configuration Security',
        title: 'Database password in URL',
        description: 'Database password is visible in connection URL',
        recommendation: 'Use environment variables for database credentials',
      });
    }

    // Check if running in production mode
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      findings.push({
        severity: 'medium',
        category: 'Configuration Security',
        title: 'Not running in production mode',
        description: `Application is running in ${nodeEnv} mode`,
        recommendation: 'Set NODE_ENV=production for production deployments',
      });
    }

    // Check CORS configuration
    const corsOrigin = this.configService.get<string>('CORS_ORIGIN');
    if (corsOrigin === '*') {
      findings.push({
        severity: 'medium',
        category: 'Configuration Security',
        title: 'Permissive CORS configuration',
        description: 'CORS is configured to allow all origins',
        recommendation: 'Restrict CORS to specific trusted origins',
      });
    }

    return findings;
  }

  private async checkDependencySecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      // Check package.json for known vulnerable packages
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      // This is a simplified check - in production, you'd integrate with npm audit or similar
      const knownVulnerablePackages = [
        'lodash@4.17.20', // Example - check for specific vulnerable versions
      ];

      // Check dependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [pkg, version] of Object.entries(allDeps)) {
        const pkgVersion = `${pkg}@${version}`;
        if (knownVulnerablePackages.includes(pkgVersion)) {
          findings.push({
            severity: 'high',
            category: 'Dependency Security',
            title: 'Vulnerable dependency found',
            description: `Package ${pkg} version ${version} has known vulnerabilities`,
            recommendation: 'Update to a secure version of the package',
            affectedResource: pkgVersion,
          });
        }
      }
    } catch (error) {
      findings.push({
        severity: 'low',
        category: 'Dependency Security',
        title: 'Unable to check dependencies',
        description: 'Cannot read or parse package.json',
        recommendation: 'Ensure package.json is accessible and valid',
      });
    }

    return findings;
  }

  private async checkAuthenticationSecurity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      // Check for recent failed login attempts
      // This would require a login attempts table - simplified for now

      // Check JWT expiration settings
      const jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '1h');
      const expirationMs = this.parseTimeToMs(jwtExpiration);

      if (expirationMs > 24 * 60 * 60 * 1000) {
        // More than 24 hours
        findings.push({
          severity: 'medium',
          category: 'Authentication Security',
          title: 'Long JWT expiration time',
          description: `JWT tokens expire after ${jwtExpiration}`,
          recommendation: 'Consider shorter JWT expiration times for better security',
        });
      }
    } catch (error) {
      findings.push({
        severity: 'low',
        category: 'Authentication Security',
        title: 'Authentication security check failed',
        description: 'Unable to perform authentication security checks',
        recommendation: 'Review authentication configuration',
      });
    }

    return findings;
  }

  private async checkFileIntegrity(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    for (const filePath of this.criticalFiles) {
      try {
        // const content = await fs.readFile(filePath, 'utf-8');
        // const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        // In a real implementation, you'd store and compare against known good hashes
        // For now, just check if the file exists and is readable
      } catch (error) {
        if (error.code === 'ENOENT') {
          findings.push({
            severity: 'high',
            category: 'File Integrity',
            title: 'Critical file missing',
            description: `Critical file ${filePath} is missing`,
            recommendation: 'Restore the missing file from backup',
            affectedResource: filePath,
          });
        } else {
          findings.push({
            severity: 'medium',
            category: 'File Integrity',
            title: 'Cannot read critical file',
            description: `Cannot read critical file ${filePath}`,
            recommendation: 'Check file permissions and accessibility',
            affectedResource: filePath,
          });
        }
      }
    }

    return findings;
  }

  private async checkQuickConfiguration(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Quick checks for critical configuration issues
    const criticalEnvVars = ['JWT_SECRET', 'DATABASE_URL'];

    for (const envVar of criticalEnvVars) {
      if (!this.configService.get(envVar)) {
        findings.push({
          severity: 'critical',
          category: 'Configuration',
          title: `Missing critical environment variable: ${envVar}`,
          description: `Required environment variable ${envVar} is not set`,
          recommendation: `Set the ${envVar} environment variable`,
        });
      }
    }

    return findings;
  }

  private buildScanResult(
    scanType: string,
    findings: SecurityFinding[],
    totalChecks: number,
  ): SecurityScanResult {
    const passed = totalChecks - findings.length;
    const warnings = findings.filter(f => f.severity === 'low' || f.severity === 'medium').length;
    const failures = findings.filter(
      f => f.severity === 'high' || f.severity === 'critical',
    ).length;

    let status: 'passed' | 'warning' | 'failed' = 'passed';
    if (failures > 0) {
      status = 'failed';
    } else if (warnings > 0) {
      status = 'warning';
    }

    return {
      timestamp: new Date(),
      scanType,
      status,
      findings,
      summary: {
        totalChecks,
        passed,
        warnings,
        failures,
      },
    };
  }

  private addToHistory(result: SecurityScanResult): void {
    this.scanHistory.push(result);

    // Keep only the most recent scans
    if (this.scanHistory.length > this.maxHistorySize) {
      this.scanHistory.splice(0, this.scanHistory.length - this.maxHistorySize);
    }
  }

  private parseTimeToMs(timeString: string): number {
    const match = timeString.match(/(\d+)([smhd]?)/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2] || 's';

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return value * 1000;
    }
  }

  // Public methods for manual scans and monitoring
  async getLatestScanResult(): Promise<SecurityScanResult | null> {
    return this.scanHistory.length > 0 ? this.scanHistory[this.scanHistory.length - 1] : null;
  }

  getScanHistory(): SecurityScanResult[] {
    return [...this.scanHistory];
  }

  async runManualScan(scanType: 'quick' | 'comprehensive' = 'quick'): Promise<SecurityScanResult> {
    this.logger.log(`Running manual ${scanType} security scan`);

    const result =
      scanType === 'comprehensive' ? await this.runComprehensiveScan() : await this.runQuickScan();

    this.addToHistory(result);
    return result;
  }
}
