import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

interface SecurityEvent {
  id?: string;
  timestamp: Date;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  source: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  details: Record<string, any>;
  riskScore: number;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'authentication_failure',
  AUTHENTICATION_SUCCESS = 'authentication_success',
  AUTHORIZATION_FAILURE = 'authorization_failure',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INPUT_VALIDATION_FAILURE = 'input_validation_failure',
  FILE_UPLOAD_BLOCKED = 'file_upload_blocked',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTEMPT = 'csrf_attempt',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  ACCOUNT_LOCKOUT = 'account_lockout',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  MALWARE_DETECTED = 'malware_detected',
  CONFIGURATION_CHANGE = 'configuration_change',
  SYSTEM_COMPROMISE = 'system_compromise',
  POLICY_VIOLATION = 'policy_violation',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior',
  SECURITY_SCAN_RESULT = 'security_scan_result',
}

enum SecurityEventSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

interface SecurityAlert {
  id: string;
  timestamp: Date;
  alertType: string;
  severity: SecurityEventSeverity;
  title: string;
  description: string;
  affectedEvents: string[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  escalated: boolean;
  escalatedTo?: string;
  escalatedAt?: Date;
}

interface SecurityMetrics {
  totalEvents: number;
  eventsBySeverity: Record<SecurityEventSeverity, number>;
  eventsByType: Record<SecurityEventType, number>;
  topRiskUsers: Array<{ userId: string; riskScore: number; eventCount: number }>;
  topRiskIPs: Array<{ ipAddress: string; riskScore: number; eventCount: number }>;
  recentTrends: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  alertsSummary: {
    total: number;
    unacknowledged: number;
    unresolved: number;
    critical: number;
  };
}

@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger(SecurityLoggerService.name);
  private readonly logFilePath: string;
  private readonly maxLogFileSize = 100 * 1024 * 1024; // 100MB
  private readonly maxLogFiles = 10;
  private readonly eventBuffer: SecurityEvent[] = [];
  private readonly bufferFlushInterval = 5000; // 5 seconds
  private readonly alertThresholds = {
    [SecurityEventType.AUTHENTICATION_FAILURE]: { count: 5, timeWindow: 300000 }, // 5 failures in 5 minutes
    [SecurityEventType.RATE_LIMIT_EXCEEDED]: { count: 10, timeWindow: 600000 }, // 10 rate limits in 10 minutes
    [SecurityEventType.SUSPICIOUS_ACTIVITY]: { count: 3, timeWindow: 300000 }, // 3 suspicious activities in 5 minutes
    [SecurityEventType.BRUTE_FORCE_ATTEMPT]: { count: 1, timeWindow: 0 }, // Immediate alert
    [SecurityEventType.SQL_INJECTION_ATTEMPT]: { count: 1, timeWindow: 0 }, // Immediate alert
    [SecurityEventType.XSS_ATTEMPT]: { count: 1, timeWindow: 0 }, // Immediate alert
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.logFilePath = this.configService.get<string>(
      'SECURITY_LOG_PATH',
      path.join(process.cwd(), 'logs', 'security.log'),
    );

    this.initializeLogging();
    this.startBufferFlushTimer();
  }

  private async initializeLogging(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFilePath);
      await fs.mkdir(logDir, { recursive: true });
      this.logger.log(`Security logging initialized: ${this.logFilePath}`);
    } catch (error) {
      this.logger.error('Failed to initialize security logging', error);
    }
  }

  private startBufferFlushTimer(): void {
    setInterval(() => {
      this.flushEventBuffer();
    }, this.bufferFlushInterval);
  }

  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: SecurityEventSeverity,
    source: string,
    details: Record<string, any>,
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      resource?: string;
      action?: string;
    },
  ): Promise<void> {
    const event: SecurityEvent = {
      timestamp: new Date(),
      eventType,
      severity,
      source,
      userId: context?.userId,
      sessionId: context?.sessionId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      resource: context?.resource,
      action: context?.action,
      details,
      riskScore: this.calculateRiskScore(eventType, severity, details),
      resolved: false,
    };

    // Add to buffer for batch processing
    this.eventBuffer.push(event);

    // Log to console/file immediately for critical events
    if (severity === SecurityEventSeverity.CRITICAL) {
      this.logger.error(`CRITICAL SECURITY EVENT: ${eventType}`, {
        event,
      });
      await this.flushEventBuffer(); // Immediate flush for critical events
    } else if (severity === SecurityEventSeverity.HIGH) {
      this.logger.warn(`HIGH SECURITY EVENT: ${eventType}`, {
        event,
      });
    }

    // Check for alert conditions
    await this.checkAlertConditions(event);
  }

  private calculateRiskScore(
    eventType: SecurityEventType,
    severity: SecurityEventSeverity,
    details: Record<string, any>,
  ): number {
    let baseScore = 0;

    // Base score by event type
    const eventTypeScores = {
      [SecurityEventType.AUTHENTICATION_FAILURE]: 2,
      [SecurityEventType.AUTHENTICATION_SUCCESS]: 0,
      [SecurityEventType.AUTHORIZATION_FAILURE]: 3,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 5,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 3,
      [SecurityEventType.INPUT_VALIDATION_FAILURE]: 2,
      [SecurityEventType.FILE_UPLOAD_BLOCKED]: 3,
      [SecurityEventType.SQL_INJECTION_ATTEMPT]: 8,
      [SecurityEventType.XSS_ATTEMPT]: 7,
      [SecurityEventType.CSRF_ATTEMPT]: 6,
      [SecurityEventType.BRUTE_FORCE_ATTEMPT]: 9,
      [SecurityEventType.ACCOUNT_LOCKOUT]: 4,
      [SecurityEventType.PRIVILEGE_ESCALATION]: 9,
      [SecurityEventType.DATA_BREACH_ATTEMPT]: 10,
      [SecurityEventType.MALWARE_DETECTED]: 10,
      [SecurityEventType.CONFIGURATION_CHANGE]: 3,
      [SecurityEventType.SYSTEM_COMPROMISE]: 10,
      [SecurityEventType.POLICY_VIOLATION]: 4,
      [SecurityEventType.ANOMALOUS_BEHAVIOR]: 5,
      [SecurityEventType.SECURITY_SCAN_RESULT]: 1,
    };

    baseScore = eventTypeScores[eventType] || 1;

    // Severity multiplier
    const severityMultipliers = {
      [SecurityEventSeverity.LOW]: 1,
      [SecurityEventSeverity.MEDIUM]: 1.5,
      [SecurityEventSeverity.HIGH]: 2,
      [SecurityEventSeverity.CRITICAL]: 3,
    };

    baseScore *= severityMultipliers[severity];

    // Additional factors
    if (details.repeated) {
      baseScore *= 1.5;
    }
    if (details.fromTorNetwork) {
      baseScore *= 1.3;
    }
    if (details.fromVPN) {
      baseScore *= 1.2;
    }
    if (details.outsideBusinessHours) {
      baseScore *= 1.1;
    }

    return Math.min(Math.round(baseScore), 10); // Cap at 10
  }

  private async checkAlertConditions(event: SecurityEvent): Promise<void> {
    const threshold = this.alertThresholds[event.eventType];
    if (!threshold) return;

    const timeWindow = threshold.timeWindow;
    const since = new Date(Date.now() - timeWindow);

    try {
      // Count recent events of the same type
      const recentEventCount = await this.getEventCount({
        eventType: event.eventType,
        since: timeWindow > 0 ? since : undefined,
        ipAddress: event.ipAddress,
        userId: event.userId,
      });

      if (recentEventCount >= threshold.count) {
        await this.createAlert({
          alertType: `${event.eventType}_threshold_exceeded`,
          severity: event.severity,
          title: `${event.eventType} threshold exceeded`,
          description: `${recentEventCount} ${event.eventType} events detected${timeWindow > 0 ? ` in the last ${timeWindow / 1000} seconds` : ''}`,
          affectedEvents: [], // Would need to query for actual event IDs
        });
      }
    } catch (error) {
      this.logger.error('Failed to check alert conditions', error);
    }
  }

  private async createAlert(
    alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'acknowledged' | 'resolved' | 'escalated'>,
  ): Promise<void> {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      acknowledged: false,
      resolved: false,
      escalated: false,
      ...alertData,
    };

    this.logger.error(`SECURITY ALERT: ${alert.title}`, { alert });

    // In a real implementation, you might:
    // - Store alerts in database
    // - Send notifications (email, Slack, etc.)
    // - Trigger automated responses
    // - Update monitoring dashboards
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = this.eventBuffer.splice(0);

    try {
      // Write to file
      await this.writeEventsToFile(eventsToFlush);

      // Store in database (if needed)
      if (this.configService.get<boolean>('SECURITY_LOG_TO_DATABASE', false)) {
        await this.storeEventsInDatabase(eventsToFlush);
      }
    } catch (error) {
      this.logger.error('Failed to flush security event buffer', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...eventsToFlush);
    }
  }

  private async writeEventsToFile(events: SecurityEvent[]): Promise<void> {
    try {
      const logEntries = events.map(event => JSON.stringify(event)).join('\n') + '\n';
      await fs.appendFile(this.logFilePath, logEntries);

      // Check file size and rotate if necessary
      await this.rotateLogFileIfNeeded();
    } catch (error) {
      this.logger.error('Failed to write security events to file', error);
      throw error;
    }
  }

  private async rotateLogFileIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath);
      if (stats.size > this.maxLogFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${this.logFilePath}.${timestamp}`;
        await fs.rename(this.logFilePath, rotatedPath);

        // Clean up old log files
        await this.cleanupOldLogFiles();

        this.logger.log(`Security log file rotated: ${rotatedPath}`);
      }
    } catch (error) {
      this.logger.error('Failed to rotate security log file', error);
    }
  }

  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFilePath);
      const logFileName = path.basename(this.logFilePath);
      const files = await fs.readdir(logDir);

      const logFiles = files
        .filter(file => file.startsWith(logFileName) && file !== logFileName)
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (newest first)

      // Keep only the most recent log files
      const filesToDelete = logFiles.slice(this.maxLogFiles);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        this.logger.log(`Deleted old security log file: ${file.name}`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old security log files', error);
    }
  }

  private async storeEventsInDatabase(events: SecurityEvent[]): Promise<void> {
    // This would require a SecurityEvent table in your database schema
    // For now, we'll just log that we would store them
    this.logger.debug(`Would store ${events.length} security events in database`);
  }

  // Query methods
  async getEventCount(_filters: {
    eventType?: SecurityEventType;
    severity?: SecurityEventSeverity;
    userId?: string;
    ipAddress?: string;
    since?: Date;
    until?: Date;
  }): Promise<number> {
    // This would query the database or parse log files
    // For now, return a mock count
    return 0;
  }

  async getEvents(_filters: {
    eventType?: SecurityEventType;
    severity?: SecurityEventSeverity;
    userId?: string;
    ipAddress?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  }): Promise<SecurityEvent[]> {
    // This would query the database or parse log files
    // For now, return empty array
    return [];
  }

  async getSecurityMetrics(_timeRange: { since: Date; until: Date }): Promise<SecurityMetrics> {
    // This would aggregate data from database or log files
    // For now, return mock metrics
    return {
      totalEvents: 0,
      eventsBySeverity: {
        [SecurityEventSeverity.LOW]: 0,
        [SecurityEventSeverity.MEDIUM]: 0,
        [SecurityEventSeverity.HIGH]: 0,
        [SecurityEventSeverity.CRITICAL]: 0,
      },
      eventsByType: Object.values(SecurityEventType).reduce(
        (acc, type) => {
          acc[type] = 0;
          return acc;
        },
        {} as Record<SecurityEventType, number>,
      ),
      topRiskUsers: [],
      topRiskIPs: [],
      recentTrends: {
        last24Hours: 0,
        last7Days: 0,
        last30Days: 0,
      },
      alertsSummary: {
        total: 0,
        unacknowledged: 0,
        unresolved: 0,
        critical: 0,
      },
    };
  }

  // Convenience methods for common security events
  async logAuthenticationFailure(
    userId: string,
    ipAddress: string,
    reason: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.AUTHENTICATION_FAILURE,
      SecurityEventSeverity.MEDIUM,
      'authentication',
      { reason },
      { userId, ipAddress, userAgent },
    );
  }

  async logSuspiciousActivity(
    description: string,
    ipAddress: string,
    details: Record<string, any>,
    userId?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      SecurityEventSeverity.HIGH,
      'system',
      { description, ...details },
      { userId, ipAddress },
    );
  }

  async logRateLimitExceeded(
    ipAddress: string,
    endpoint: string,
    requestCount: number,
    userId?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.RATE_LIMIT_EXCEEDED,
      SecurityEventSeverity.MEDIUM,
      'rate_limiter',
      { endpoint, requestCount },
      { userId, ipAddress },
    );
  }

  async logInputValidationFailure(
    field: string,
    value: string,
    reason: string,
    ipAddress: string,
    userId?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.INPUT_VALIDATION_FAILURE,
      SecurityEventSeverity.LOW,
      'validation',
      { field, value: value.substring(0, 100), reason }, // Truncate value for security
      { userId, ipAddress },
    );
  }

  async logSqlInjectionAttempt(
    query: string,
    ipAddress: string,
    endpoint: string,
    userId?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.SQL_INJECTION_ATTEMPT,
      SecurityEventSeverity.CRITICAL,
      'database',
      { query: query.substring(0, 200), endpoint }, // Truncate query
      { userId, ipAddress },
    );
  }

  async logXssAttempt(
    payload: string,
    ipAddress: string,
    endpoint: string,
    userId?: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.XSS_ATTEMPT,
      SecurityEventSeverity.HIGH,
      'input_filter',
      { payload: payload.substring(0, 200), endpoint }, // Truncate payload
      { userId, ipAddress },
    );
  }

  // Cleanup method to be called on application shutdown
  async shutdown(): Promise<void> {
    await this.flushEventBuffer();
    this.logger.log('Security logger shutdown complete');
  }
}

// Export enums for use in other modules
export { SecurityEventType, SecurityEventSeverity };
