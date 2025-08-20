import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

interface SecurityHeadersConfig {
  enableHSTS: boolean;
  hstsMaxAge: number;
  hstsIncludeSubDomains: boolean;
  hstsPreload: boolean;
  enableCSP: boolean;
  cspDirectives: Record<string, string[]>;
  enableXFrameOptions: boolean;
  xFrameOptions: string;
  enableXContentTypeOptions: boolean;
  enableReferrerPolicy: boolean;
  referrerPolicy: string;
  enablePermissionsPolicy: boolean;
  permissionsPolicyDirectives: Record<string, string[]>;
  enableExpectCT: boolean;
  expectCTMaxAge: number;
  expectCTEnforce: boolean;
}

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly config: SecurityHeadersConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      enableHSTS: this.configService.get<boolean>('SECURITY_ENABLE_HSTS', true),
      hstsMaxAge: this.configService.get<number>('SECURITY_HSTS_MAX_AGE', 31536000), // 1 year
      hstsIncludeSubDomains: this.configService.get<boolean>(
        'SECURITY_HSTS_INCLUDE_SUBDOMAINS',
        true,
      ),
      hstsPreload: this.configService.get<boolean>('SECURITY_HSTS_PRELOAD', false),

      enableCSP: this.configService.get<boolean>('SECURITY_ENABLE_CSP', true),
      cspDirectives: this.parseCSPDirectives(),

      enableXFrameOptions: this.configService.get<boolean>('SECURITY_ENABLE_X_FRAME_OPTIONS', true),
      xFrameOptions: this.configService.get<string>('SECURITY_X_FRAME_OPTIONS', 'DENY'),

      enableXContentTypeOptions: this.configService.get<boolean>(
        'SECURITY_ENABLE_X_CONTENT_TYPE_OPTIONS',
        true,
      ),

      enableReferrerPolicy: this.configService.get<boolean>(
        'SECURITY_ENABLE_REFERRER_POLICY',
        true,
      ),
      referrerPolicy: this.configService.get<string>(
        'SECURITY_REFERRER_POLICY',
        'strict-origin-when-cross-origin',
      ),

      enablePermissionsPolicy: this.configService.get<boolean>(
        'SECURITY_ENABLE_PERMISSIONS_POLICY',
        true,
      ),
      permissionsPolicyDirectives: this.parsePermissionsPolicyDirectives(),

      enableExpectCT: this.configService.get<boolean>('SECURITY_ENABLE_EXPECT_CT', false),
      expectCTMaxAge: this.configService.get<number>('SECURITY_EXPECT_CT_MAX_AGE', 86400), // 24 hours
      expectCTEnforce: this.configService.get<boolean>('SECURITY_EXPECT_CT_ENFORCE', false),
    };
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Set HSTS (HTTP Strict Transport Security)
    if (this.config.enableHSTS && req.secure) {
      let hstsValue = `max-age=${this.config.hstsMaxAge}`;
      if (this.config.hstsIncludeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (this.config.hstsPreload) {
        hstsValue += '; preload';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Set Content Security Policy
    if (this.config.enableCSP) {
      const cspValue = this.buildCSPHeader();
      res.setHeader('Content-Security-Policy', cspValue);
    }

    // Set X-Frame-Options
    if (this.config.enableXFrameOptions) {
      res.setHeader('X-Frame-Options', this.config.xFrameOptions);
    }

    // Set X-Content-Type-Options
    if (this.config.enableXContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // Set X-XSS-Protection (legacy, but still useful for older browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Set Referrer Policy
    if (this.config.enableReferrerPolicy) {
      res.setHeader('Referrer-Policy', this.config.referrerPolicy);
    }

    // Set Permissions Policy (formerly Feature Policy)
    if (this.config.enablePermissionsPolicy) {
      const permissionsPolicyValue = this.buildPermissionsPolicyHeader();
      if (permissionsPolicyValue) {
        res.setHeader('Permissions-Policy', permissionsPolicyValue);
      }
    }

    // Set Expect-CT
    if (this.config.enableExpectCT) {
      let expectCTValue = `max-age=${this.config.expectCTMaxAge}`;
      if (this.config.expectCTEnforce) {
        expectCTValue += ', enforce';
      }
      res.setHeader('Expect-CT', expectCTValue);
    }

    // Set Cross-Origin-Embedder-Policy
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Set Cross-Origin-Opener-Policy
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Set Cross-Origin-Resource-Policy
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // Remove server information
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Set custom security headers
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // Set cache control for sensitive endpoints
    if (this.isSensitiveEndpoint(req.path)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }

    next();
  }

  private parseCSPDirectives(): Record<string, string[]> {
    const defaultDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://js.stripe.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https://api.stripe.com'],
      'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': [],
    };

    // Allow customization via environment variables
    const customCSP = this.configService.get<string>('SECURITY_CSP_DIRECTIVES');
    if (customCSP) {
      try {
        const parsed = JSON.parse(customCSP);
        return { ...defaultDirectives, ...parsed };
      } catch (error) {
        console.warn('Failed to parse custom CSP directives, using defaults');
      }
    }

    return defaultDirectives;
  }

  private parsePermissionsPolicyDirectives(): Record<string, string[]> {
    const defaultDirectives = {
      accelerometer: [],
      'ambient-light-sensor': [],
      autoplay: [],
      battery: [],
      camera: [],
      'cross-origin-isolated': [],
      'display-capture': [],
      'document-domain': [],
      'encrypted-media': [],
      'execution-while-not-rendered': [],
      'execution-while-out-of-viewport': [],
      fullscreen: ['self'],
      geolocation: [],
      gyroscope: [],
      'keyboard-map': [],
      magnetometer: [],
      microphone: [],
      midi: [],
      'navigation-override': [],
      payment: ['self'],
      'picture-in-picture': [],
      'publickey-credentials-get': [],
      'screen-wake-lock': [],
      'sync-xhr': [],
      usb: [],
      'web-share': [],
      'xr-spatial-tracking': [],
    };

    // Allow customization via environment variables
    const customPermissions = this.configService.get<string>(
      'SECURITY_PERMISSIONS_POLICY_DIRECTIVES',
    );
    if (customPermissions) {
      try {
        const parsed = JSON.parse(customPermissions);
        return { ...defaultDirectives, ...parsed };
      } catch (error) {
        console.warn('Failed to parse custom Permissions Policy directives, using defaults');
      }
    }

    return defaultDirectives;
  }

  private buildCSPHeader(): string {
    const directives: string[] = [];

    for (const [directive, sources] of Object.entries(this.config.cspDirectives)) {
      if (sources.length === 0) {
        directives.push(directive);
      } else {
        directives.push(`${directive} ${sources.join(' ')}`);
      }
    }

    return directives.join('; ');
  }

  private buildPermissionsPolicyHeader(): string {
    const directives: string[] = [];

    for (const [directive, allowlist] of Object.entries(this.config.permissionsPolicyDirectives)) {
      if (allowlist.length === 0) {
        directives.push(`${directive}=()`);
      } else {
        const formattedAllowlist = allowlist
          .map(origin => (origin === 'self' ? 'self' : `"${origin}"`))
          .join(' ');
        directives.push(`${directive}=(${formattedAllowlist})`);
      }
    }

    return directives.join(', ');
  }

  private isSensitiveEndpoint(path: string): boolean {
    const sensitivePatterns = [
      /^\/api\/auth\//,
      /^\/api\/user\//,
      /^\/api\/admin\//,
      /^\/api\/subscription\//,
      /^\/api\/payment\//,
      /^\/api\/setup\//,
    ];

    return sensitivePatterns.some(pattern => pattern.test(path));
  }
}
