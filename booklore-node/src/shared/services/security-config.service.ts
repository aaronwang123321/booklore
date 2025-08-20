import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SecurityConfig {
  // Authentication settings
  jwt: {
    secret: string;
    expirationTime: string;
    refreshExpirationTime: string;
    issuer: string;
    audience: string;
  };

  // Password policy
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAge: number; // days
    preventReuse: number; // number of previous passwords to check
  };

  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    standardHeaders: boolean;
    legacyHeaders: boolean;
  };

  // Session management
  session: {
    maxConcurrentSessions: number;
    sessionTimeout: number; // minutes
    extendOnActivity: boolean;
    secureOnly: boolean;
    sameSite: 'strict' | 'lax' | 'none';
  };

  // File upload security
  fileUpload: {
    maxFileSize: number; // bytes
    allowedMimeTypes: string[];
    allowedExtensions: string[];
    scanForMalware: boolean;
    quarantinePath: string;
  };

  // Input validation
  validation: {
    maxStringLength: number;
    maxArrayLength: number;
    maxObjectDepth: number;
    sanitizeHtml: boolean;
    allowedHtmlTags: string[];
    stripUnknownTags: boolean;
  };

  // Security headers
  headers: {
    hsts: {
      enabled: boolean;
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    csp: {
      enabled: boolean;
      directives: Record<string, string[]>;
      reportOnly: boolean;
      reportUri?: string;
    };
    frameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    contentTypeOptions: boolean;
    xssProtection: boolean;
    referrerPolicy: string;
    permissionsPolicy: Record<string, string[]>;
  };

  // CORS settings
  cors: {
    origin: string | string[] | boolean;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
    preflightContinue: boolean;
    optionsSuccessStatus: number;
  };

  // API security
  api: {
    requireApiKey: boolean;
    apiKeyHeader: string;
    apiKeyQueryParam: string;
    rateLimitByApiKey: boolean;
    logApiUsage: boolean;
  };

  // Monitoring and alerting
  monitoring: {
    logSecurityEvents: boolean;
    alertOnSuspiciousActivity: boolean;
    maxFailedAttempts: number;
    lockoutDuration: number; // minutes
    alertThresholds: {
      failedLogins: number;
      suspiciousIps: number;
      rateLimitExceeded: number;
    };
  };

  // IP filtering
  ipFiltering: {
    enabled: boolean;
    whitelist: string[];
    blacklist: string[];
    allowPrivateNetworks: boolean;
    blockTorNodes: boolean;
    blockVpns: boolean;
  };
}

@Injectable()
export class SecurityConfigService {
  private readonly logger = new Logger(SecurityConfigService.name);
  private readonly config: SecurityConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadSecurityConfig();
    this.validateConfig();
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      jwt: {
        secret: this.configService.get<string>('JWT_SECRET', 'default-secret-change-in-production'),
        expirationTime: this.configService.get<string>('JWT_EXPIRATION', '1h'),
        refreshExpirationTime: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
        issuer: this.configService.get<string>('JWT_ISSUER', 'booklore'),
        audience: this.configService.get<string>('JWT_AUDIENCE', 'booklore-users'),
      },

      password: {
        minLength: this.configService.get<number>('PASSWORD_MIN_LENGTH', 8),
        requireUppercase: this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true),
        requireLowercase: this.configService.get<boolean>('PASSWORD_REQUIRE_LOWERCASE', true),
        requireNumbers: this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBERS', true),
        requireSpecialChars: this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL', true),
        maxAge: this.configService.get<number>('PASSWORD_MAX_AGE_DAYS', 90),
        preventReuse: this.configService.get<number>('PASSWORD_PREVENT_REUSE', 5),
      },

      rateLimit: {
        windowMs: this.configService.get<number>('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
        maxRequests: this.configService.get<number>('RATE_LIMIT_MAX_REQUESTS', 100),
        skipSuccessfulRequests: this.configService.get<boolean>('RATE_LIMIT_SKIP_SUCCESS', false),
        skipFailedRequests: this.configService.get<boolean>('RATE_LIMIT_SKIP_FAILED', false),
        standardHeaders: this.configService.get<boolean>('RATE_LIMIT_STANDARD_HEADERS', true),
        legacyHeaders: this.configService.get<boolean>('RATE_LIMIT_LEGACY_HEADERS', false),
      },

      session: {
        maxConcurrentSessions: this.configService.get<number>('SESSION_MAX_CONCURRENT', 5),
        sessionTimeout: this.configService.get<number>('SESSION_TIMEOUT_MINUTES', 30),
        extendOnActivity: this.configService.get<boolean>('SESSION_EXTEND_ON_ACTIVITY', true),
        secureOnly: this.configService.get<boolean>('SESSION_SECURE_ONLY', true),
        sameSite: this.configService.get<'strict' | 'lax' | 'none'>('SESSION_SAME_SITE', 'strict'),
      },

      fileUpload: {
        maxFileSize: this.configService.get<number>('FILE_UPLOAD_MAX_SIZE', 10 * 1024 * 1024), // 10MB
        allowedMimeTypes: this.configService
          .get<string>(
            'FILE_UPLOAD_ALLOWED_TYPES',
            'image/jpeg,image/png,image/gif,application/pdf,text/plain',
          )
          .split(','),
        allowedExtensions: this.configService
          .get<string>('FILE_UPLOAD_ALLOWED_EXTENSIONS', '.jpg,.jpeg,.png,.gif,.pdf,.txt')
          .split(','),
        scanForMalware: this.configService.get<boolean>('FILE_UPLOAD_SCAN_MALWARE', false),
        quarantinePath: this.configService.get<string>(
          'FILE_UPLOAD_QUARANTINE_PATH',
          './quarantine',
        ),
      },

      validation: {
        maxStringLength: this.configService.get<number>('VALIDATION_MAX_STRING_LENGTH', 10000),
        maxArrayLength: this.configService.get<number>('VALIDATION_MAX_ARRAY_LENGTH', 1000),
        maxObjectDepth: this.configService.get<number>('VALIDATION_MAX_OBJECT_DEPTH', 10),
        sanitizeHtml: this.configService.get<boolean>('VALIDATION_SANITIZE_HTML', true),
        allowedHtmlTags: this.configService
          .get<string>('VALIDATION_ALLOWED_HTML_TAGS', 'p,br,strong,em,u,ol,ul,li')
          .split(','),
        stripUnknownTags: this.configService.get<boolean>('VALIDATION_STRIP_UNKNOWN_TAGS', true),
      },

      headers: {
        hsts: {
          enabled: this.configService.get<boolean>('SECURITY_HSTS_ENABLED', true),
          maxAge: this.configService.get<number>('SECURITY_HSTS_MAX_AGE', 31536000), // 1 year
          includeSubDomains: this.configService.get<boolean>(
            'SECURITY_HSTS_INCLUDE_SUBDOMAINS',
            true,
          ),
          preload: this.configService.get<boolean>('SECURITY_HSTS_PRELOAD', false),
        },
        csp: {
          enabled: this.configService.get<boolean>('SECURITY_CSP_ENABLED', true),
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'font-src': ["'self'"],
            'connect-src': ["'self'"],
            'frame-ancestors': ["'none'"],
          },
          reportOnly: this.configService.get<boolean>('SECURITY_CSP_REPORT_ONLY', false),
          reportUri: this.configService.get<string>('SECURITY_CSP_REPORT_URI'),
        },
        frameOptions: this.configService.get<'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM'>(
          'SECURITY_FRAME_OPTIONS',
          'DENY',
        ),
        contentTypeOptions: this.configService.get<boolean>('SECURITY_CONTENT_TYPE_OPTIONS', true),
        xssProtection: this.configService.get<boolean>('SECURITY_XSS_PROTECTION', true),
        referrerPolicy: this.configService.get<string>(
          'SECURITY_REFERRER_POLICY',
          'strict-origin-when-cross-origin',
        ),
        permissionsPolicy: {
          camera: ['none'],
          microphone: ['none'],
          geolocation: ['none'],
          payment: ['none'],
        },
      },

      cors: {
        origin: this.parseCorsOrigin(
          this.configService.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
        ),
        methods: this.configService
          .get<string>('CORS_METHODS', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS')
          .split(','),
        allowedHeaders: this.configService
          .get<string>('CORS_ALLOWED_HEADERS', 'Content-Type,Authorization,X-Requested-With')
          .split(','),
        exposedHeaders: this.configService
          .get<string>('CORS_EXPOSED_HEADERS', '')
          .split(',')
          .filter(h => h),
        credentials: this.configService.get<boolean>('CORS_CREDENTIALS', true),
        maxAge: this.configService.get<number>('CORS_MAX_AGE', 86400), // 24 hours
        preflightContinue: this.configService.get<boolean>('CORS_PREFLIGHT_CONTINUE', false),
        optionsSuccessStatus: this.configService.get<number>('CORS_OPTIONS_SUCCESS_STATUS', 204),
      },

      api: {
        requireApiKey: this.configService.get<boolean>('API_REQUIRE_KEY', false),
        apiKeyHeader: this.configService.get<string>('API_KEY_HEADER', 'X-API-Key'),
        apiKeyQueryParam: this.configService.get<string>('API_KEY_QUERY_PARAM', 'apikey'),
        rateLimitByApiKey: this.configService.get<boolean>('API_RATE_LIMIT_BY_KEY', true),
        logApiUsage: this.configService.get<boolean>('API_LOG_USAGE', true),
      },

      monitoring: {
        logSecurityEvents: this.configService.get<boolean>('SECURITY_LOG_EVENTS', true),
        alertOnSuspiciousActivity: this.configService.get<boolean>(
          'SECURITY_ALERT_SUSPICIOUS',
          true,
        ),
        maxFailedAttempts: this.configService.get<number>('SECURITY_MAX_FAILED_ATTEMPTS', 5),
        lockoutDuration: this.configService.get<number>('SECURITY_LOCKOUT_DURATION_MINUTES', 15),
        alertThresholds: {
          failedLogins: this.configService.get<number>('SECURITY_ALERT_FAILED_LOGINS', 10),
          suspiciousIps: this.configService.get<number>('SECURITY_ALERT_SUSPICIOUS_IPS', 5),
          rateLimitExceeded: this.configService.get<number>('SECURITY_ALERT_RATE_LIMIT', 20),
        },
      },

      ipFiltering: {
        enabled: this.configService.get<boolean>('IP_FILTERING_ENABLED', false),
        whitelist: this.configService
          .get<string>('IP_WHITELIST', '')
          .split(',')
          .filter(ip => ip),
        blacklist: this.configService
          .get<string>('IP_BLACKLIST', '')
          .split(',')
          .filter(ip => ip),
        allowPrivateNetworks: this.configService.get<boolean>('IP_ALLOW_PRIVATE_NETWORKS', true),
        blockTorNodes: this.configService.get<boolean>('IP_BLOCK_TOR_NODES', false),
        blockVpns: this.configService.get<boolean>('IP_BLOCK_VPNS', false),
      },
    };
  }

  private parseCorsOrigin(origin: string): string | string[] | boolean {
    if (origin === 'true') return true;
    if (origin === 'false') return false;
    if (origin.includes(',')) return origin.split(',').map(o => o.trim());
    return origin;
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate JWT secret
    if (this.config.jwt.secret === 'default-secret-change-in-production') {
      errors.push('JWT_SECRET is using default value - change in production');
    }
    if (this.config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters long');
    }

    // Validate password policy
    if (this.config.password.minLength < 8) {
      errors.push('PASSWORD_MIN_LENGTH should be at least 8');
    }

    // Validate rate limiting
    if (this.config.rateLimit.maxRequests < 1) {
      errors.push('RATE_LIMIT_MAX_REQUESTS should be at least 1');
    }
    if (this.config.rateLimit.windowMs < 1000) {
      errors.push('RATE_LIMIT_WINDOW_MS should be at least 1000ms');
    }

    // Validate file upload
    if (this.config.fileUpload.maxFileSize < 1024) {
      errors.push('FILE_UPLOAD_MAX_SIZE should be at least 1024 bytes');
    }

    // Validate session settings
    if (this.config.session.sessionTimeout < 1) {
      errors.push('SESSION_TIMEOUT_MINUTES should be at least 1');
    }

    if (errors.length > 0) {
      this.logger.warn('Security configuration validation warnings:', errors);
    }
  }

  // Getter methods for different configuration sections
  getJwtConfig() {
    return this.config.jwt;
  }

  getPasswordPolicy() {
    return this.config.password;
  }

  getRateLimitConfig() {
    return this.config.rateLimit;
  }

  getSessionConfig() {
    return this.config.session;
  }

  getFileUploadConfig() {
    return this.config.fileUpload;
  }

  getValidationConfig() {
    return this.config.validation;
  }

  getSecurityHeadersConfig() {
    return this.config.headers;
  }

  getCorsConfig() {
    return this.config.cors;
  }

  getApiConfig() {
    return this.config.api;
  }

  getMonitoringConfig() {
    return this.config.monitoring;
  }

  getIpFilteringConfig() {
    return this.config.ipFiltering;
  }

  getFullConfig(): SecurityConfig {
    return { ...this.config };
  }

  // Utility methods
  isProductionMode(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  isDevelopmentMode(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }

  shouldEnforceStrictSecurity(): boolean {
    return this.isProductionMode();
  }

  getEnvironmentSpecificConfig<T>(prodValue: T, devValue: T): T {
    return this.isProductionMode() ? prodValue : devValue;
  }

  // Dynamic configuration updates (for runtime changes)
  updateRateLimitConfig(config: Partial<SecurityConfig['rateLimit']>): void {
    Object.assign(this.config.rateLimit, config);
    this.logger.log('Rate limit configuration updated');
  }

  updateMonitoringConfig(config: Partial<SecurityConfig['monitoring']>): void {
    Object.assign(this.config.monitoring, config);
    this.logger.log('Monitoring configuration updated');
  }

  // Security policy validation
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const policy = this.config.password;

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isFileTypeAllowed(mimeType: string, extension: string): boolean {
    const config = this.config.fileUpload;
    return (
      config.allowedMimeTypes.includes(mimeType) &&
      config.allowedExtensions.includes(extension.toLowerCase())
    );
  }

  isFileSizeAllowed(size: number): boolean {
    return size <= this.config.fileUpload.maxFileSize;
  }

  shouldLogSecurityEvent(eventType: string): boolean {
    return this.config.monitoring.logSecurityEvents;
  }

  shouldAlertOnSuspiciousActivity(): boolean {
    return this.config.monitoring.alertOnSuspiciousActivity;
  }
}
