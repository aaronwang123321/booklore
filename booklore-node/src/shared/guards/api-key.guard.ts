import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SecurityLoggerService } from '../services/security-logger.service';
import * as crypto from 'crypto';

interface ApiKeyConfig {
  headerName: string;
  queryParamName: string;
  validKeys: string[];
  enableRateLimit: boolean;
  rateLimitWindow: number;
  rateLimitMax: number;
}

interface ApiKeyUsage {
  key: string;
  requests: number[];
  lastUsed: Date;
}

const API_KEY_REQUIRED_KEY = 'api_key_required';
export const RequireApiKey = () => SetMetadata(API_KEY_REQUIRED_KEY, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly config: ApiKeyConfig;
  private readonly keyUsage = new Map<string, ApiKeyUsage>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly securityLogger: SecurityLoggerService,
  ) {
    this.config = {
      headerName: this.configService.get<string>('API_KEY_HEADER_NAME', 'X-API-Key'),
      queryParamName: this.configService.get<string>('API_KEY_QUERY_PARAM', 'api_key'),
      validKeys: this.parseValidKeys(),
      enableRateLimit: this.configService.get<boolean>('API_KEY_RATE_LIMIT_ENABLED', true),
      rateLimitWindow: this.configService.get<number>('API_KEY_RATE_LIMIT_WINDOW', 60000), // 1 minute
      rateLimitMax: this.configService.get<number>('API_KEY_RATE_LIMIT_MAX', 100),
    };

    // Clean up old usage records every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldUsageRecords();
      },
      5 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isRequired = this.reflector.getAllAndOverride<boolean>(API_KEY_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If not required, skip API key validation
    if (!isRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    // If API key is required but not provided, deny access
    if (isRequired && !apiKey) {
      await this.securityLogger.logSecurityEvent(
        'API_KEY_MISSING' as any,
        'MEDIUM' as any,
        request.ip || 'unknown',
        {
          endpoint: request.url,
          userAgent: request.get('User-Agent'),
        },
        {
          ipAddress: request.ip,
          userAgent: request.get('User-Agent'),
        },
      );

      throw new UnauthorizedException('API key is required');
    }

    // Validate the API key
    if (apiKey && !this.validateApiKey(apiKey)) {
      this.logger.warn('Invalid API key provided', {
        url: request.url,
        method: request.method,
        ip: request.ip,
        keyHash: this.hashApiKey(apiKey),
        userAgent: request.headers['user-agent'],
      });
      throw new UnauthorizedException('Invalid API key');
    }

    // Check rate limits for valid API keys
    if (apiKey && this.config.enableRateLimit) {
      if (!this.checkRateLimit(apiKey)) {
        this.logger.warn('API key rate limit exceeded', {
          url: request.url,
          method: request.method,
          ip: request.ip,
          keyHash: this.hashApiKey(apiKey),
        });
        throw new UnauthorizedException('API key rate limit exceeded');
      }
    }

    // Record API key usage
    if (apiKey) {
      this.recordApiKeyUsage(apiKey);

      // Add API key info to request for logging/monitoring
      request['apiKey'] = {
        hash: this.hashApiKey(apiKey),
        valid: true,
      };
    }

    return true;
  }

  private extractApiKey(request: Request): string | null {
    // Try to get API key from header
    const headerKey = request.headers[this.config.headerName.toLowerCase()] as string;
    if (headerKey) {
      return headerKey;
    }

    // Try to get API key from query parameter
    const queryKey = request.query[this.config.queryParamName] as string;
    if (queryKey) {
      return queryKey;
    }

    // Try to get API key from Authorization header (Bearer token format)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Check if the API key is in the list of valid keys
    return this.config.validKeys.includes(apiKey);
  }

  private checkRateLimit(apiKey: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;

    let usage = this.keyUsage.get(apiKey);
    if (!usage) {
      usage = {
        key: apiKey,
        requests: [],
        lastUsed: new Date(),
      };
      this.keyUsage.set(apiKey, usage);
    }

    // Remove old requests outside the window
    usage.requests = usage.requests.filter(timestamp => timestamp > windowStart);

    // Check if we're within the rate limit
    return usage.requests.length < this.config.rateLimitMax;
  }

  private recordApiKeyUsage(apiKey: string): void {
    const now = Date.now();

    let usage = this.keyUsage.get(apiKey);
    if (!usage) {
      usage = {
        key: apiKey,
        requests: [],
        lastUsed: new Date(),
      };
      this.keyUsage.set(apiKey, usage);
    }

    usage.requests.push(now);
    usage.lastUsed = new Date();
  }

  private cleanupOldUsageRecords(): void {
    const now = Date.now();
    const maxAge = this.config.rateLimitWindow * 2; // Keep records for 2x the window

    for (const [key, usage] of this.keyUsage.entries()) {
      // Remove old request timestamps
      usage.requests = usage.requests.filter(timestamp => now - timestamp < maxAge);

      // Remove usage records that haven't been used recently
      if (now - usage.lastUsed.getTime() > maxAge) {
        this.keyUsage.delete(key);
      }
    }
  }

  private parseValidKeys(): string[] {
    const keysString = this.configService.get<string>('API_KEYS', '');
    if (!keysString) {
      this.logger.warn('No API keys configured. API key authentication will not work.');
      return [];
    }

    const keys = keysString
      .split(',')
      .map(key => key.trim())
      .filter(Boolean);

    // Validate key format
    const validKeys = keys.filter(key => {
      if (key.length < 32) {
        this.logger.warn(`API key too short (minimum 32 characters): ${key.substring(0, 8)}...`);
        return false;
      }
      return true;
    });

    this.logger.log(`Loaded ${validKeys.length} valid API keys`);
    return validKeys;
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  // Public method to get API key usage statistics (for monitoring)
  getUsageStatistics(): Array<{
    keyHash: string;
    requestCount: number;
    lastUsed: Date;
    currentWindowRequests: number;
  }> {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;

    return Array.from(this.keyUsage.values()).map(usage => ({
      keyHash: this.hashApiKey(usage.key),
      requestCount: usage.requests.length,
      lastUsed: usage.lastUsed,
      currentWindowRequests: usage.requests.filter(timestamp => timestamp > windowStart).length,
    }));
  }

  // Public method to revoke an API key (for emergency situations)
  revokeApiKey(apiKey: string): boolean {
    const index = this.config.validKeys.indexOf(apiKey);
    if (index > -1) {
      this.config.validKeys.splice(index, 1);
      this.keyUsage.delete(apiKey);
      this.logger.warn(`API key revoked: ${this.hashApiKey(apiKey)}`);
      return true;
    }
    return false;
  }
}
