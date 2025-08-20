import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ThrottlerException } from '@nestjs/throttler';
import { ValidationError } from 'class-validator';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  details?: any;
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string;

    const errorResponse = this.buildErrorResponse(exception, request, requestId);

    // Log error with appropriate level
    this.logError(exception, errorResponse, requestId);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    request: Request,
    requestId?: string,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const method = request.method;

    const baseResponse: Omit<ErrorResponse, 'statusCode' | 'message' | 'error'> = {
      timestamp,
      path,
      method,
      ...(requestId && { requestId }),
    };

    // Handle HTTP exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        return {
          ...baseResponse,
          statusCode: status,
          message: responseObj.message || exception.message,
          error: responseObj.error || exception.name,
          ...(responseObj.details && { details: responseObj.details }),
        };
      }

      return {
        ...baseResponse,
        statusCode: status,
        message: exception.message,
        error: exception.name,
      };
    }

    // Handle Prisma errors
    if (exception instanceof PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, baseResponse);
    }

    // Handle Throttler exceptions
    if (exception instanceof ThrottlerException) {
      return {
        ...baseResponse,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        error: 'ThrottlerException',
      };
    }

    // Handle validation errors
    if (this.isValidationError(exception)) {
      return {
        ...baseResponse,
        statusCode: HttpStatus.BAD_REQUEST,
        message: this.extractValidationMessages(exception as any),
        error: 'ValidationError',
      };
    }

    // Handle unknown errors
    return {
      ...baseResponse,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
      ...(process.env.NODE_ENV !== 'production' && {
        details: {
          name: (exception as Error)?.name,
          message: (exception as Error)?.message,
          stack: (exception as Error)?.stack,
        },
      }),
    };
  }

  private handlePrismaError(
    exception: PrismaClientKnownRequestError,
    baseResponse: Omit<ErrorResponse, 'statusCode' | 'message' | 'error'>,
  ): ErrorResponse {
    switch (exception.code) {
      case 'P2002':
        return {
          ...baseResponse,
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this data already exists',
          error: 'ConflictError',
          details: {
            fields: exception.meta?.target,
          },
        };

      case 'P2025':
        return {
          ...baseResponse,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'NotFoundError',
        };

      case 'P2003':
        return {
          ...baseResponse,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          error: 'ForeignKeyError',
          details: {
            field: exception.meta?.field_name,
          },
        };

      case 'P2014':
        return {
          ...baseResponse,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid data provided',
          error: 'InvalidDataError',
        };

      default:
        return {
          ...baseResponse,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database operation failed',
          error: 'DatabaseError',
          ...(process.env.NODE_ENV !== 'production' && {
            details: {
              code: exception.code,
              meta: exception.meta,
            },
          }),
        };
    }
  }

  private isValidationError(exception: unknown): boolean {
    return (
      Array.isArray(exception) && exception.length > 0 && exception[0] instanceof ValidationError
    );
  }

  private extractValidationMessages(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    const extractMessages = (error: ValidationError, parentPath = '') => {
      const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;

      if (error.constraints) {
        Object.values(error.constraints).forEach(message => {
          messages.push(`${currentPath}: ${message}`);
        });
      }

      if (error.children && error.children.length > 0) {
        error.children.forEach(child => extractMessages(child, currentPath));
      }
    };

    errors.forEach(error => extractMessages(error));
    return messages;
  }

  private logError(exception: unknown, errorResponse: ErrorResponse, requestId?: string): void {
    const logContext = {
      statusCode: errorResponse.statusCode,
      path: errorResponse.path,
      method: errorResponse.method,
      requestId,
      timestamp: errorResponse.timestamp,
    };

    if (errorResponse.statusCode >= 500) {
      // Server errors - log as error with full details
      this.logger.error(
        `${errorResponse.method} ${errorResponse.path} - ${errorResponse.message}`,
        {
          ...logContext,
          error: exception instanceof Error ? exception.stack : exception,
          details: errorResponse.details,
        },
      );
    } else if (errorResponse.statusCode >= 400) {
      // Client errors - log as warning
      this.logger.warn(
        `${errorResponse.method} ${errorResponse.path} - ${errorResponse.message}`,
        logContext,
      );
    } else {
      // Other errors - log as debug
      this.logger.debug(
        `${errorResponse.method} ${errorResponse.path} - ${errorResponse.message}`,
        logContext,
      );
    }
  }
}
