import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import * as DOMPurify from 'isomorphic-dompurify';

interface ValidationOptionsInterface {
  skipBodyValidation?: boolean;
  skipQueryValidation?: boolean;
  skipParamsValidation?: boolean;
  skipFileValidation?: boolean;
  maxFileSize?: number;
  allowedFileTypes?: string[];
}

const VALIDATION_OPTIONS_KEY = 'validation_options';

export const ValidationOptions = (options: ValidationOptionsInterface) =>
  SetMetadata(VALIDATION_OPTIONS_KEY, options);

@Injectable()
export class InputValidationGuard implements CanActivate {
  private readonly logger = new Logger(InputValidationGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const options = this.reflector.get<ValidationOptionsInterface>(
      VALIDATION_OPTIONS_KEY,
      context.getHandler(),
    );

    try {
      // Validate and sanitize request body
      if (request.body && typeof request.body === 'object' && !options?.skipBodyValidation) {
        request.body = this.sanitizeObject(request.body, options);
        this.validateObject(request.body);
      }

      // Validate and sanitize query parameters
      if (request.query && typeof request.query === 'object' && !options?.skipQueryValidation) {
        request.query = this.sanitizeObject(request.query, options);
        this.validateObject(request.query);
      }

      // Validate and sanitize URL parameters
      if (request.params && typeof request.params === 'object' && !options?.skipParamsValidation) {
        request.params = this.sanitizeObject(request.params, options);
        this.validateObject(request.params);
      }

      // Validate uploaded files
      if ((request.files || request.file) && !options?.skipFileValidation) {
        this.validateFiles(request, options);
      }

      return true;
    } catch (error) {
      this.logger.warn(`Input validation failed: ${error.message}`, {
        url: request.url,
        method: request.method,
        ip: request.ip,
      });
      throw new BadRequestException(error.message);
    }
  }

  private sanitizeObject(obj: any, options?: ValidationOptionsInterface): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Sanitize HTML
        const sanitizedValue = DOMPurify.sanitize(value);

        // Check string length (default 10000 chars)
        if (sanitizedValue.length > 10000) {
          throw new BadRequestException(
            `String too long for field ${key}: ${sanitizedValue.length} > 10000`,
          );
        }

        sanitized[key] = sanitizedValue;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, options);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private validateObject(obj: any): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        this.checkSuspiciousPatterns(value, key);
      } else if (typeof value === 'object' && value !== null) {
        this.validateObject(value);
      }
    }
  }

  private validateKey(key: string): void {
    // Check for suspicious key names
    const suspiciousPatterns = [/^__/, /prototype/i, /constructor/i, /__proto__/i, /\x00/, /%00/];

    if (suspiciousPatterns.some(pattern => pattern.test(key))) {
      throw new BadRequestException(`Invalid property name: ${key}`);
    }

    // Check key length
    if (key.length > 100) {
      throw new BadRequestException('Property name too long');
    }
  }

  private checkSuspiciousPatterns(value: string, fieldName: string): void {
    // Check for null bytes
    if (value.includes('\0') || value.includes('%00')) {
      throw new BadRequestException(`Null byte detected in field '${fieldName}'`);
    }

    // Check for suspicious patterns that might indicate injection attempts
    const suspiciousPatterns = [
      {
        pattern: /<script[^>]*>.*?<\/script>/gi,
        message: 'Script tag detected',
      },
      {
        pattern: /javascript:/gi,
        message: 'JavaScript protocol detected',
      },
      {
        pattern: /vbscript:/gi,
        message: 'VBScript protocol detected',
      },
      {
        pattern: /on\w+\s*=/gi,
        message: 'Event handler detected',
      },
      {
        pattern: /eval\s*\(/gi,
        message: 'Eval function detected',
      },
      {
        pattern: /expression\s*\(/gi,
        message: 'CSS expression detected',
      },
      {
        pattern: /(union|select|insert|update|delete|drop|create|alter)\s+/gi,
        message: 'SQL keyword detected',
      },
      {
        pattern: /\$\{.*\}/g,
        message: 'Template literal detected',
      },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(value)) {
        throw new BadRequestException(`${message} in field '${fieldName}'`);
      }
    }

    // Check for excessive repetition (potential DoS)
    if (this.hasExcessiveRepetition(value)) {
      throw new BadRequestException(
        `Excessive character repetition detected in field '${fieldName}'`,
      );
    }
  }

  private sanitizeHtml(value: string): string {
    try {
      // Use DOMPurify to sanitize HTML content
      return DOMPurify.sanitize(value, {
        ALLOWED_TAGS: [], // Remove all HTML tags
        ALLOWED_ATTR: [], // Remove all attributes
        KEEP_CONTENT: true, // Keep text content
      });
    } catch (error) {
      this.logger.warn(`HTML sanitization failed: ${error.message}`);
      // Fallback: remove all HTML tags manually
      return value.replace(/<[^>]*>/g, '');
    }
  }

  private hasExcessiveRepetition(value: string): boolean {
    // Check for patterns like 'aaaaaaa...' or '111111...'
    const repetitionPattern = /(.)\1{50,}/;
    return repetitionPattern.test(value);
  }

  private validateFiles(request: Request, options?: ValidationOptionsInterface): void {
    const files = request.files as Express.Multer.File[] | undefined;
    const file = request.file as Express.Multer.File | undefined;
    const allFiles = files ? files : file ? [file] : [];

    for (const uploadedFile of allFiles) {
      // Check file size
      const maxSize = options?.maxFileSize || 10 * 1024 * 1024; // 10MB default
      if (uploadedFile.size > maxSize) {
        throw new BadRequestException(`File too large: ${uploadedFile.size} > ${maxSize}`);
      }

      // Check file type
      if (options?.allowedFileTypes?.length) {
        const fileExtension = uploadedFile.originalname.split('.').pop()?.toLowerCase();
        if (!fileExtension || !options.allowedFileTypes.includes(fileExtension)) {
          throw new BadRequestException(`File type not allowed: ${fileExtension}`);
        }
      }

      // Check MIME type
      if (!uploadedFile.mimetype || uploadedFile.mimetype.includes('..')) {
        throw new BadRequestException('Invalid file MIME type');
      }
    }
  }

  private validateFilename(filename: string): void {
    // Check for suspicious filename patterns
    const suspiciousPatterns = [
      /\.\.\//, // Directory traversal
      /\x00/, // Null bytes
      /%00/, // URL encoded null bytes
      /[<>:"|?*]/, // Invalid filename characters
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(filename))) {
      throw new BadRequestException('Invalid filename');
    }

    // Check filename length
    if (filename.length > 255) {
      throw new BadRequestException('Filename too long');
    }
  }

  private sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
