import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class PerformanceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PerformanceMiddleware.name);

  constructor(private readonly monitoringService: MonitoringService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    // Extract route pattern for better grouping
    const route = this.extractRoute(req);
    const method = req.method;

    // Add request ID for tracing
    const requestId = this.generateRequestId();
    req['requestId'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Log request start
    this.logger.debug(`[${requestId}] ${method} ${route} - Started`);

    // Override res.end to capture response metrics
    const originalEnd = res.end;
    res.end = (chunk?: any, encoding?: any, cb?: () => void): any => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      const endMemory = process.memoryUsage();

      // Record metrics
      this.monitoringService.recordHttpRequest(
        method,
        route,
        res.statusCode,
        duration / 1000, // Convert to seconds for Prometheus
      );

      // Log performance data
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      this.logger.debug(
        `[${requestId}] ${method} ${route} - ${res.statusCode} - ${duration.toFixed(2)}ms - Memory: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
      );

      // Log slow requests
      if (duration > 1000) {
        this.logger.warn(
          `[${requestId}] SLOW REQUEST: ${method} ${route} - ${duration.toFixed(2)}ms`,
        );
      }

      // Record errors
      if (res.statusCode >= 400) {
        const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
        this.monitoringService.recordHttpError(method, route, errorType);
      }

      return originalEnd.call(res, chunk, encoding, cb);
    };

    next();
  }

  private extractRoute(req: Request): string {
    // Try to get the route pattern from the request
    if (req.route?.path) {
      return req.route.path;
    }

    // Fallback to URL path with parameter normalization
    let path = req.path;

    // Normalize common patterns
    path = path.replace(/\/\d+/g, '/:id'); // Replace numeric IDs
    path = path.replace(/\/[a-f0-9-]{36}/g, '/:uuid'); // Replace UUIDs
    path = path.replace(/\/[a-f0-9]{24}/g, '/:objectId'); // Replace MongoDB ObjectIds

    return path;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
