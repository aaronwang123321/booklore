import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for custom business exceptions
 */
export abstract class BusinessException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly errorCode?: string,
    public readonly details?: any,
  ) {
    super(
      {
        message,
        error: errorCode || 'BusinessError',
        statusCode,
        ...(details && { details }),
      },
      statusCode,
    );
  }
}

/**
 * Resource not found exception
 */
export class ResourceNotFoundException extends BusinessException {
  constructor(resource: string, identifier?: string | number, details?: any) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    super(message, HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', {
      resource,
      identifier,
      ...details,
    });
  }
}

/**
 * Resource already exists exception
 */
export class ResourceAlreadyExistsException extends BusinessException {
  constructor(resource: string, identifier?: string | number, details?: any) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' already exists`
      : `${resource} already exists`;

    super(message, HttpStatus.CONFLICT, 'RESOURCE_ALREADY_EXISTS', {
      resource,
      identifier,
      ...details,
    });
  }
}

/**
 * Invalid operation exception
 */
export class InvalidOperationException extends BusinessException {
  constructor(operation: string, reason?: string, details?: any) {
    const message = reason
      ? `Invalid operation '${operation}': ${reason}`
      : `Invalid operation '${operation}'`;

    super(message, HttpStatus.BAD_REQUEST, 'INVALID_OPERATION', {
      operation,
      reason,
      ...details,
    });
  }
}

/**
 * Insufficient permissions exception
 */
export class InsufficientPermissionsException extends BusinessException {
  constructor(action: string, resource?: string, details?: any) {
    const message = resource
      ? `Insufficient permissions to ${action} ${resource}`
      : `Insufficient permissions to ${action}`;

    super(message, HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS', {
      action,
      resource,
      ...details,
    });
  }
}

/**
 * Resource limit exceeded exception
 */
export class ResourceLimitExceededException extends BusinessException {
  constructor(resource: string, limit: number, current?: number, details?: any) {
    const message =
      current !== undefined
        ? `${resource} limit exceeded: ${current}/${limit}`
        : `${resource} limit of ${limit} exceeded`;

    super(message, HttpStatus.FORBIDDEN, 'RESOURCE_LIMIT_EXCEEDED', {
      resource,
      limit,
      current,
      ...details,
    });
  }
}

/**
 * File processing exception
 */
export class FileProcessingException extends BusinessException {
  constructor(filename: string, operation: string, reason?: string, details?: any) {
    const message = reason
      ? `Failed to ${operation} file '${filename}': ${reason}`
      : `Failed to ${operation} file '${filename}'`;

    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'FILE_PROCESSING_ERROR', {
      filename,
      operation,
      reason,
      ...details,
    });
  }
}

/**
 * External service exception
 */
export class ExternalServiceException extends BusinessException {
  constructor(service: string, operation: string, reason?: string, details?: any) {
    const message = reason
      ? `External service '${service}' failed during ${operation}: ${reason}`
      : `External service '${service}' failed during ${operation}`;

    super(message, HttpStatus.BAD_GATEWAY, 'EXTERNAL_SERVICE_ERROR', {
      service,
      operation,
      reason,
      ...details,
    });
  }
}

/**
 * Subscription required exception
 */
export class SubscriptionRequiredException extends BusinessException {
  constructor(feature: string, requiredPlan?: string, details?: any) {
    const message = requiredPlan
      ? `Feature '${feature}' requires ${requiredPlan} subscription`
      : `Feature '${feature}' requires an active subscription`;

    super(message, HttpStatus.PAYMENT_REQUIRED, 'SUBSCRIPTION_REQUIRED', {
      feature,
      requiredPlan,
      ...details,
    });
  }
}

/**
 * Rate limit exceeded exception
 */
export class RateLimitExceededException extends BusinessException {
  constructor(operation: string, limit: number, resetTime?: Date, details?: any) {
    const message = resetTime
      ? `Rate limit exceeded for ${operation}. Limit: ${limit}. Resets at: ${resetTime.toISOString()}`
      : `Rate limit exceeded for ${operation}. Limit: ${limit}`;

    super(message, HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED', {
      operation,
      limit,
      resetTime: resetTime?.toISOString(),
      ...details,
    });
  }
}

/**
 * Data validation exception
 */
export class DataValidationException extends BusinessException {
  constructor(field: string, value: any, constraint: string, details?: any) {
    const message = `Validation failed for field '${field}': ${constraint}`;

    super(message, HttpStatus.BAD_REQUEST, 'DATA_VALIDATION_ERROR', {
      field,
      value,
      constraint,
      ...details,
    });
  }
}

/**
 * Configuration exception
 */
export class ConfigurationException extends BusinessException {
  constructor(setting: string, reason?: string, details?: any) {
    const message = reason
      ? `Configuration error for '${setting}': ${reason}`
      : `Configuration error for '${setting}'`;

    super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'CONFIGURATION_ERROR', {
      setting,
      reason,
      ...details,
    });
  }
}

/**
 * Maintenance mode exception
 */
export class MaintenanceModeException extends BusinessException {
  constructor(estimatedDuration?: string, details?: any) {
    const message = estimatedDuration
      ? `Service is currently under maintenance. Estimated duration: ${estimatedDuration}`
      : 'Service is currently under maintenance';

    super(message, HttpStatus.SERVICE_UNAVAILABLE, 'MAINTENANCE_MODE', {
      estimatedDuration,
      ...details,
    });
  }
}
