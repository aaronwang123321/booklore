import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  meta?: {
    timestamp: string;
    path: string;
    method: string;
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = request.headers['x-request-id'] as string;

    return next.handle().pipe(
      map(data => {
        // Skip transformation for certain routes
        if (this.shouldSkipTransformation(request.path)) {
          return data;
        }

        const statusCode = response.statusCode;
        const timestamp = new Date().toISOString();
        const path = request.url;
        const method = request.method;

        // Handle different response types
        if (this.isAlreadyFormatted(data)) {
          return data;
        }

        // Extract pagination info if present
        const pagination = this.extractPagination(data);

        // Extract actual data if it's wrapped
        const actualData = this.extractData(data);

        // Extract message if present
        const message = this.extractMessage(data, method, statusCode);

        const apiResponse: ApiResponse<T> = {
          success: statusCode >= 200 && statusCode < 300,
          statusCode,
          message,
          data: actualData,
          meta: {
            timestamp,
            path,
            method,
            ...(requestId && { requestId }),
            ...(pagination && { pagination }),
          },
        };

        // Log successful responses in debug mode
        if (process.env.NODE_ENV !== 'production') {
          this.logger.debug(`${method} ${path} - ${statusCode} - ${message || 'Success'}`, {
            requestId,
            statusCode,
            dataSize: this.getDataSize(actualData),
          });
        }

        return apiResponse;
      }),
    );
  }

  private shouldSkipTransformation(path: string): boolean {
    const skipPaths = [
      '/health',
      '/health/detailed',
      '/metrics',
      '/performance',
      '/api/docs',
      '/opds',
    ];

    return skipPaths.some(skipPath => path.startsWith(skipPath));
  }

  private isAlreadyFormatted(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      'success' in data &&
      'statusCode' in data &&
      'meta' in data
    );
  }

  private extractPagination(data: any): any {
    if (data && typeof data === 'object') {
      // Check for common pagination patterns
      if ('pagination' in data) {
        return data.pagination;
      }

      if ('meta' in data && data.meta && 'pagination' in data.meta) {
        return data.meta.pagination;
      }

      // Check for array with pagination info
      if (Array.isArray(data) && data.length > 0) {
        const firstItem = data[0];
        if (firstItem && typeof firstItem === 'object' && '_pagination' in firstItem) {
          return firstItem._pagination;
        }
      }
    }

    return null;
  }

  private extractData(data: any): any {
    if (data && typeof data === 'object') {
      // If data has a 'data' property, extract it
      if ('data' in data && !('success' in data)) {
        return data.data;
      }

      // If data has 'items' property (common for lists), extract it
      if ('items' in data) {
        return data.items;
      }

      // If data has 'result' property, extract it
      if ('result' in data) {
        return data.result;
      }
    }

    return data;
  }

  private extractMessage(data: any, method: string, statusCode: number): string {
    // Check if data contains a message
    if (data && typeof data === 'object' && 'message' in data) {
      return data.message;
    }

    // Generate default messages based on method and status
    switch (method) {
      case 'POST':
        return statusCode === 201
          ? 'Resource created successfully'
          : 'Operation completed successfully';
      case 'PUT':
      case 'PATCH':
        return 'Resource updated successfully';
      case 'DELETE':
        return 'Resource deleted successfully';
      case 'GET':
        return 'Data retrieved successfully';
      default:
        return 'Operation completed successfully';
    }
  }

  private getDataSize(data: any): string {
    if (Array.isArray(data)) {
      return `${data.length} items`;
    }

    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      return `${keys.length} properties`;
    }

    if (typeof data === 'string') {
      return `${data.length} characters`;
    }

    return typeof data;
  }
}
