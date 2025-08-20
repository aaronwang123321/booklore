import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as promClient from 'prom-client';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly register: promClient.Registry;

  // HTTP metrics
  private readonly httpRequestDuration: promClient.Histogram<string>;
  private readonly httpRequestTotal: promClient.Counter<string>;
  private readonly httpRequestErrors: promClient.Counter<string>;

  // Application metrics
  private readonly activeConnections: promClient.Gauge<string>;
  private readonly cacheHitRate: promClient.Gauge<string>;
  private readonly cacheOperations: promClient.Counter<string>;
  private readonly queueSize: promClient.Gauge<string>;
  private readonly queueProcessingTime: promClient.Histogram<string>;

  // Database metrics
  private readonly dbConnectionPool: promClient.Gauge<string>;
  private readonly dbQueryDuration: promClient.Histogram<string>;
  private readonly dbQueryTotal: promClient.Counter<string>;

  // Memory and GC metrics
  private readonly memoryUsage: promClient.Gauge<string>;
  private readonly gcDuration: promClient.Histogram<string>;
  private readonly gcCount: promClient.Counter<string>;

  constructor(private configService: ConfigService) {
    this.register = new promClient.Registry();

    // Initialize HTTP metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.httpRequestTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestErrors = new promClient.Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
      registers: [this.register],
    });

    // Initialize application metrics
    this.activeConnections = new promClient.Gauge({
      name: 'websocket_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [this.register],
    });

    this.cacheHitRate = new promClient.Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type'],
      registers: [this.register],
    });

    this.cacheOperations = new promClient.Counter({
      name: 'cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation', 'result'],
      registers: [this.register],
    });

    this.queueSize = new promClient.Gauge({
      name: 'queue_size',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name'],
      registers: [this.register],
    });

    this.queueProcessingTime = new promClient.Histogram({
      name: 'queue_job_processing_duration_seconds',
      help: 'Time spent processing queue jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
      registers: [this.register],
    });

    // Initialize database metrics
    this.dbConnectionPool = new promClient.Gauge({
      name: 'database_connections_active',
      help: 'Number of active database connections',
      registers: [this.register],
    });

    this.dbQueryDuration = new promClient.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.register],
    });

    this.dbQueryTotal = new promClient.Counter({
      name: 'database_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status'],
      registers: [this.register],
    });

    // Initialize memory metrics
    this.memoryUsage = new promClient.Gauge({
      name: 'nodejs_memory_usage_bytes',
      help: 'Node.js memory usage in bytes',
      labelNames: ['type'],
      registers: [this.register],
    });

    this.gcDuration = new promClient.Histogram({
      name: 'nodejs_gc_duration_seconds',
      help: 'Time spent in garbage collection',
      labelNames: ['kind'],
      buckets: [0.001, 0.01, 0.1, 1, 10],
      registers: [this.register],
    });

    this.gcCount = new promClient.Counter({
      name: 'nodejs_gc_runs_total',
      help: 'Total number of garbage collection runs',
      labelNames: ['kind'],
      registers: [this.register],
    });

    // Collect default metrics
    // Temporarily disabled due to compatibility issues
    // // 暂时注释掉 collectDefaultMetrics 以避免兼容性问题
    // try {
    //   if (promClient.collectDefaultMetrics) {
    //     promClient.collectDefaultMetrics({ register: this.register });
    //   }
    // } catch (error) {
    //   console.warn('Failed to collect default metrics:', error.message);
    // }

    // Start collecting custom metrics
    this.startMetricsCollection();

    this.logger.log('📊 Monitoring service initialized');
  }

  // HTTP Metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration,
    );
    this.httpRequestTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  recordHttpError(method: string, route: string, errorType: string) {
    this.httpRequestErrors.inc({ method, route, error_type: errorType });
  }

  // WebSocket Metrics
  setActiveConnections(count: number) {
    this.activeConnections.set(count);
  }

  incrementActiveConnections() {
    this.activeConnections.inc();
  }

  decrementActiveConnections() {
    this.activeConnections.dec();
  }

  // Cache Metrics
  recordCacheOperation(
    operation: 'get' | 'set' | 'del',
    result: 'hit' | 'miss' | 'success' | 'error',
  ) {
    this.cacheOperations.inc({ operation, result });
  }

  setCacheHitRate(cacheType: string, rate: number) {
    this.cacheHitRate.set({ cache_type: cacheType }, rate);
  }

  // Queue Metrics
  setQueueSize(queueName: string, size: number) {
    this.queueSize.set({ queue_name: queueName }, size);
  }

  recordQueueJobProcessing(queueName: string, jobType: string, duration: number) {
    this.queueProcessingTime.observe({ queue_name: queueName, job_type: jobType }, duration);
  }

  // Database Metrics
  setDatabaseConnections(count: number) {
    this.dbConnectionPool.set(count);
  }

  recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number,
    status: 'success' | 'error',
  ) {
    this.dbQueryDuration.observe({ operation, table }, duration);
    this.dbQueryTotal.inc({ operation, table, status });
  }

  // Memory Metrics
  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.memoryUsage.set({ type: 'external' }, memUsage.external);
    this.memoryUsage.set({ type: 'array_buffers' }, memUsage.arrayBuffers);
  }

  recordGarbageCollection(kind: string, duration: number) {
    this.gcDuration.observe({ kind }, duration);
    this.gcCount.inc({ kind });
  }

  // Get metrics for Prometheus endpoint
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  // Get application health metrics
  async getHealthMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      eventLoop: {
        delay: await this.getEventLoopDelay(),
      },
    };
  }

  private async getEventLoopDelay(): Promise<number> {
    return new Promise(resolve => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const delta = process.hrtime.bigint() - start;
        resolve(Number(delta) / 1000000); // Convert to milliseconds
      });
    });
  }

  private startMetricsCollection() {
    // Collect memory metrics every 30 seconds
    setInterval(() => {
      this.recordMemoryUsage();
    }, 30000);

    // Monitor garbage collection
    if (typeof global.gc === 'function') {
      const originalGc = global.gc;
      global.gc = async () => {
        const start = process.hrtime.bigint();
        originalGc();
        const duration = Number(process.hrtime.bigint() - start) / 1000000000; // Convert to seconds
        this.recordGarbageCollection('manual', duration);
      };
    }

    this.logger.log('📊 Started metrics collection');
  }

  // Performance analysis helpers
  async getPerformanceReport(): Promise<any> {
    const metrics = await this.getHealthMetrics();
    const prometheusMetrics = await this.register.getMetricsAsJSON();

    // Calculate key performance indicators
    const httpMetrics = prometheusMetrics.find(m => m.name === 'http_request_duration_seconds');
    const cacheMetrics = prometheusMetrics.find(m => m.name === 'cache_operations_total');
    const dbMetrics = prometheusMetrics.find(m => m.name === 'database_query_duration_seconds');

    return {
      timestamp: new Date().toISOString(),
      health: metrics,
      performance: {
        http: this.analyzeHttpMetrics(httpMetrics),
        cache: this.analyzeCacheMetrics(cacheMetrics),
        database: this.analyzeDatabaseMetrics(dbMetrics),
      },
      recommendations: this.generatePerformanceRecommendations(metrics, prometheusMetrics),
    };
  }

  private analyzeHttpMetrics(httpMetrics: any): any {
    if (!httpMetrics) return null;

    // Calculate percentiles and averages
    const buckets = httpMetrics.values || [];
    let totalRequests = 0;
    let totalDuration = 0;

    buckets.forEach((bucket: any) => {
      if (bucket.metricName === 'http_request_duration_seconds_count') {
        totalRequests += bucket.value;
      }
      if (bucket.metricName === 'http_request_duration_seconds_sum') {
        totalDuration += bucket.value;
      }
    });

    return {
      totalRequests,
      averageResponseTime: totalRequests > 0 ? totalDuration / totalRequests : 0,
      requestsPerSecond: totalRequests / process.uptime(),
    };
  }

  private analyzeCacheMetrics(cacheMetrics: any): any {
    if (!cacheMetrics) return null;

    const values = cacheMetrics.values || [];
    let hits = 0;
    let misses = 0;

    values.forEach((value: any) => {
      if (value.labels?.result === 'hit') hits += value.value;
      if (value.labels?.result === 'miss') misses += value.value;
    });

    const total = hits + misses;
    return {
      hitRate: total > 0 ? (hits / total) * 100 : 0,
      totalOperations: total,
      hits,
      misses,
    };
  }

  private analyzeDatabaseMetrics(dbMetrics: any): any {
    if (!dbMetrics) return null;

    const buckets = dbMetrics.values || [];
    let totalQueries = 0;
    let totalDuration = 0;

    buckets.forEach((bucket: any) => {
      if (bucket.metricName === 'database_query_duration_seconds_count') {
        totalQueries += bucket.value;
      }
      if (bucket.metricName === 'database_query_duration_seconds_sum') {
        totalDuration += bucket.value;
      }
    });

    return {
      totalQueries,
      averageQueryTime: totalQueries > 0 ? totalDuration / totalQueries : 0,
      queriesPerSecond: totalQueries / process.uptime(),
    };
  }

  private generatePerformanceRecommendations(health: any, metrics: any[]): string[] {
    const recommendations: string[] = [];

    // Memory recommendations
    const heapUsedPercent = (health.memory.heapUsed / health.memory.heapTotal) * 100;
    if (heapUsedPercent > 80) {
      recommendations.push(
        'High heap usage detected. Consider optimizing memory usage or increasing heap size.',
      );
    }

    // Event loop recommendations
    if (health.eventLoop.delay > 10) {
      recommendations.push(
        'High event loop delay detected. Consider optimizing synchronous operations.',
      );
    }

    // Cache recommendations
    const cacheMetric = metrics.find(m => m.name === 'cache_operations_total');
    if (cacheMetric) {
      const cacheAnalysis = this.analyzeCacheMetrics(cacheMetric);
      if (cacheAnalysis.hitRate < 70) {
        recommendations.push(
          'Low cache hit rate. Consider adjusting cache TTL or caching strategy.',
        );
      }
    }

    return recommendations;
  }
}
