import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ResourceNotFoundException,
  ResourceAlreadyExistsException,
  InvalidOperationException,
  InsufficientPermissionsException,
  ResourceLimitExceededException,
  FileProcessingException,
  ExternalServiceException,
  SubscriptionRequiredException,
  RateLimitExceededException,
  DataValidationException,
  ConfigurationException,
  MaintenanceModeException,
} from '../exceptions/custom.exceptions';

/**
 * Utility class for standardized error handling
 */
export class ErrorUtils {
  /**
   * Throw a resource not found error
   */
  static notFound(resource: string, identifier?: string | number, details?: any): never {
    throw new ResourceNotFoundException(resource, identifier, details);
  }

  /**
   * Throw a resource already exists error
   */
  static alreadyExists(resource: string, identifier?: string | number, details?: any): never {
    throw new ResourceAlreadyExistsException(resource, identifier, details);
  }

  /**
   * Throw an invalid operation error
   */
  static invalidOperation(operation: string, reason?: string, details?: any): never {
    throw new InvalidOperationException(operation, reason, details);
  }

  /**
   * Throw an insufficient permissions error
   */
  static forbidden(action: string, resource?: string, details?: any): never {
    throw new InsufficientPermissionsException(action, resource, details);
  }

  /**
   * Throw a resource limit exceeded error
   */
  static limitExceeded(resource: string, limit: number, current?: number, details?: any): never {
    throw new ResourceLimitExceededException(resource, limit, current, details);
  }

  /**
   * Throw a file processing error
   */
  static fileProcessing(
    filename: string,
    operation: string,
    reason?: string,
    details?: any,
  ): never {
    throw new FileProcessingException(filename, operation, reason, details);
  }

  /**
   * Throw an external service error
   */
  static externalService(
    service: string,
    operation: string,
    reason?: string,
    details?: any,
  ): never {
    throw new ExternalServiceException(service, operation, reason, details);
  }

  /**
   * Throw a subscription required error
   */
  static subscriptionRequired(feature: string, requiredPlan?: string, details?: any): never {
    throw new SubscriptionRequiredException(feature, requiredPlan, details);
  }

  /**
   * Throw a rate limit exceeded error
   */
  static rateLimitExceeded(
    operation: string,
    limit: number,
    resetTime?: Date,
    details?: any,
  ): never {
    throw new RateLimitExceededException(operation, limit, resetTime, details);
  }

  /**
   * Throw a data validation error
   */
  static validationFailed(field: string, value: any, constraint: string, details?: any): never {
    throw new DataValidationException(field, value, constraint, details);
  }

  /**
   * Throw a configuration error
   */
  static configurationError(setting: string, reason?: string, details?: any): never {
    throw new ConfigurationException(setting, reason, details);
  }

  /**
   * Throw a maintenance mode error
   */
  static maintenanceMode(estimatedDuration?: string, details?: any): never {
    throw new MaintenanceModeException(estimatedDuration, details);
  }

  /**
   * Throw a bad request error
   */
  static badRequest(message: string, details?: any): never {
    throw new BadRequestException({
      message,
      error: 'BadRequest',
      ...(details && { details }),
    });
  }

  /**
   * Throw an unauthorized error
   */
  static unauthorized(message = 'Unauthorized access', details?: any): never {
    throw new UnauthorizedException({
      message,
      error: 'Unauthorized',
      ...(details && { details }),
    });
  }

  /**
   * Throw an internal server error
   */
  static internalError(message = 'Internal server error', details?: any): never {
    throw new InternalServerErrorException({
      message,
      error: 'InternalServerError',
      ...(details && { details }),
    });
  }

  /**
   * Assert a condition and throw an error if it fails
   */
  static assert(
    condition: boolean,
    errorFactory: () => never,
    message?: string,
  ): asserts condition {
    if (!condition) {
      if (message) {
        console.error(`Assertion failed: ${message}`);
      }
      errorFactory();
    }
  }

  /**
   * Assert that a value is not null/undefined and throw not found if it is
   */
  static assertExists<T>(
    value: T | null | undefined,
    resource: string,
    identifier?: string | number,
  ): asserts value is T {
    if (value == null) {
      ErrorUtils.notFound(resource, identifier);
    }
  }

  /**
   * Assert that a user has permission and throw forbidden if not
   */
  static assertPermission(
    hasPermission: boolean,
    action: string,
    resource?: string,
  ): asserts hasPermission {
    if (!hasPermission) {
      ErrorUtils.forbidden(action, resource);
    }
  }

  /**
   * Wrap an async operation and convert errors to appropriate HTTP exceptions
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>,
    context?: {
      resource?: string;
      operation?: string;
      identifier?: string | number;
    },
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Handle common database errors
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          ErrorUtils.notFound(context?.resource || 'Resource', context?.identifier, {
            originalError: error.message,
          });
        }

        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          ErrorUtils.alreadyExists(context?.resource || 'Resource', context?.identifier, {
            originalError: error.message,
          });
        }

        if (error.message.includes('permission') || error.message.includes('access denied')) {
          ErrorUtils.forbidden(context?.operation || 'perform this action', context?.resource, {
            originalError: error.message,
          });
        }
      }

      // Default to internal server error
      ErrorUtils.internalError(`Failed to ${context?.operation || 'complete operation'}`, {
        resource: context?.resource,
        identifier: context?.identifier,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create a standardized error response object
   */
  static createErrorResponse(statusCode: number, message: string, error: string, details?: any) {
    return {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    };
  }

  /**
   * Check if an error is a specific type of HTTP exception
   */
  static isHttpException(error: any, statusCode?: HttpStatus): boolean {
    if (!(error instanceof HttpException)) {
      return false;
    }

    if (statusCode !== undefined) {
      return error.getStatus() === statusCode;
    }

    return true;
  }

  /**
   * Extract error message from various error types
   */
  static extractMessage(error: any): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && response !== null) {
        return (response as any).message || error.message;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
