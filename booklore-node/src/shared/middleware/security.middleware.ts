import {
  Injectable,
  NestMiddleware,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { rateLimit } from 'express-rate-limit';
import slowDown from 'express-slow-down';

interface SecurityConfig {
  maxRequestSize: number;
  allowedOrigins: string[];
  ipWhitelist: string[];
  ipBlacklist: string[];
  enableRateLimit: boolean;
  enableSlowDown: boolean;
  trustedProxies: string[];
}

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);
  private readonly config: SecurityConfig;
  private readonly rateLimiter: any;
  private readonly slowDownLimiter: any;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      maxRequestSize: this.configService.get<number>('MAX_REQUEST_SIZE', 10 * 1024 * 1024), // 10MB
      allowedOrigins: this.configService
        .get<string>('ALLOWED_ORIGINS', '')
        .split(',')
        .filter(Boolean),
      ipWhitelist: this.configService.get<string>('IP_WHITELIST', '').split(',').filter(Boolean),
      ipBlacklist: this.configService.get<string>('IP_BLACKLIST', '').split(',').filter(Boolean),
      enableRateLimit: this.configService.get<boolean>('ENABLE_RATE_LIMIT', true),
      enableSlowDown: this.configService.get<boolean>('ENABLE_SLOW_DOWN', true),
      trustedProxies: this.configService
        .get<string>('TRUSTED_PROXIES', '')
        .split(',')
        .filter(Boolean),
    };

    // Configure rate limiting
    if (this.config.enableRateLimit) {
      this.rateLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: {
          error: 'Too many requests',
          message: 'Too many requests from this IP, please try again later.',
          statusCode: 429,
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: req => this.isWhitelistedIP(this.getClientIP(req)),
      });
    }

    // Configure slow down
    if (this.config.enableSlowDown) {
      this.slowDownLimiter = slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 50, // allow 50 requests per 15 minutes, then...
        delayMs: 500, // begin adding 500ms of delay per request above 50
        maxDelayMs: 20000, // maximum delay of 20 seconds
        skip: req => this.isWhitelistedIP(this.getClientIP(req)),
      });
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Get client IP
      const clientIP = this.getClientIP(req);
      req['clientIP'] = clientIP;

      // Check IP blacklist
      if (this.isBlacklistedIP(clientIP)) {
        this.logger.warn(`Blocked request from blacklisted IP: ${clientIP}`);
        throw new ForbiddenException('Access denied');
      }

      // Validate request headers
      this.validateHeaders(req);

      // Check request size
      this.validateRequestSize(req);

      // Validate origin for CORS
      this.validateOrigin(req);

      // Apply rate limiting (if not whitelisted)
      if (this.config.enableRateLimit && !this.isWhitelistedIP(clientIP)) {
        this.rateLimiter(req, res, (err: any) => {
          if (err) {
            this.logger.warn(`Rate limit exceeded for IP: ${clientIP}`);
            return next(err);
          }
          this.applySlowDown(req, res, next);
        });
      } else {
        this.applySlowDown(req, res, next);
      }
    } catch (error) {
      next(error);
    }
  }

  private applySlowDown(req: Request, res: Response, next: NextFunction) {
    const clientIP = req['clientIP'];

    if (this.config.enableSlowDown && !this.isWhitelistedIP(clientIP)) {
      this.slowDownLimiter(req, res, next);
    } else {
      next();
    }
  }

  private getClientIP(req: Request): string {
    // Check for IP from trusted proxies
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    const xRealIP = req.headers['x-real-ip'] as string;

    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map(ip => ip.trim());
      return ips[0];
    }

    if (xRealIP) {
      return xRealIP;
    }

    return req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  }

  private isWhitelistedIP(ip: string): boolean {
    if (this.config.ipWhitelist.length === 0) {
      return false;
    }

    return this.config.ipWhitelist.some(whitelistedIP => {
      if (whitelistedIP.includes('/')) {
        // CIDR notation support
        return this.isIPInCIDR(ip, whitelistedIP);
      }
      return ip === whitelistedIP;
    });
  }

  private isBlacklistedIP(ip: string): boolean {
    if (this.config.ipBlacklist.length === 0) {
      return false;
    }

    return this.config.ipBlacklist.some(blacklistedIP => {
      if (blacklistedIP.includes('/')) {
        // CIDR notation support
        return this.isIPInCIDR(ip, blacklistedIP);
      }
      return ip === blacklistedIP;
    });
  }

  private isIPInCIDR(ip: string, cidr: string): boolean {
    // Simple CIDR check - in production, use a proper library like 'ip-range-check'
    const [network, prefixLength] = cidr.split('/');
    const networkParts = network.split('.').map(Number);
    const ipParts = ip.split('.').map(Number);

    if (networkParts.length !== 4 || ipParts.length !== 4) {
      return false;
    }

    const prefix = parseInt(prefixLength, 10);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    const networkInt =
      (networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3];
    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];

    return (networkInt & mask) === (ipInt & mask);
  }

  private validateHeaders(req: Request): void {
    const suspiciousHeaders = ['x-forwarded-host', 'x-forwarded-server', 'x-forwarded-proto'];

    // Check for suspicious headers that might indicate header injection
    for (const header of suspiciousHeaders) {
      const value = req.headers[header] as string;
      if (value && this.containsSuspiciousContent(value)) {
        this.logger.warn(`Suspicious header detected: ${header} = ${value}`);
        throw new BadRequestException('Invalid request headers');
      }
    }

    // Validate User-Agent
    const userAgent = req.headers['user-agent'] as string;
    if (userAgent && userAgent.length > 1000) {
      this.logger.warn(`Excessively long User-Agent: ${userAgent.substring(0, 100)}...`);
      throw new BadRequestException('Invalid User-Agent header');
    }

    // Check for null bytes in headers
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string' && value.includes('\0')) {
        this.logger.warn(`Null byte detected in header ${key}`);
        throw new BadRequestException('Invalid request headers');
      }
    }
  }

  private validateRequestSize(req: Request): void {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > this.config.maxRequestSize) {
        this.logger.warn(`Request size too large: ${size} bytes`);
        throw new BadRequestException('Request entity too large');
      }
    }
  }

  private validateOrigin(req: Request): void {
    const origin = req.headers.origin as string;

    // Skip origin validation for same-origin requests
    if (!origin) {
      return;
    }

    // If allowed origins are configured, validate against them
    if (this.config.allowedOrigins.length > 0) {
      const isAllowed = this.config.allowedOrigins.some(allowedOrigin => {
        if (allowedOrigin === '*') {
          return true;
        }
        if (allowedOrigin.startsWith('*.')) {
          const domain = allowedOrigin.substring(2);
          return origin.endsWith(domain);
        }
        return origin === allowedOrigin;
      });

      if (!isAllowed) {
        this.logger.warn(`Request from unauthorized origin: ${origin}`);
        throw new ForbiddenException('Origin not allowed');
      }
    }
  }

  private containsSuspiciousContent(value: string): boolean {
    const suspiciousPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\(/i,
      /expression\(/i,
      /\x00/,
      /%00/,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(value));
  }
}
