import { Logger } from '@nestjs/common';

export class MemoryOptimizer {
  private static readonly logger = new Logger(MemoryOptimizer.name);
  private static gcThreshold = 100 * 1024 * 1024; // 100MB
  private static lastGcTime = 0;
  private static gcCooldown = 30000; // 30 seconds

  /**
   * Monitor memory usage and trigger GC if needed
   */
  static monitorMemory(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Log memory usage periodically
    if (heapUsedMB > 50) {
      // Log if using more than 50MB
      this.logger.debug(
        `Memory usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${heapUsagePercent.toFixed(1)}%)`,
      );
    }

    // Trigger GC if memory usage is high
    if (this.shouldTriggerGc(memUsage)) {
      this.triggerGarbageCollection();
    }
  }

  /**
   * Check if garbage collection should be triggered
   */
  private static shouldTriggerGc(memUsage: NodeJS.MemoryUsage): boolean {
    const now = Date.now();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return (
      // High heap usage
      (heapUsagePercent > 80 || memUsage.heapUsed > this.gcThreshold) &&
      // Cooldown period has passed
      now - this.lastGcTime > this.gcCooldown
    );
  }

  /**
   * Trigger garbage collection if available
   */
  static triggerGarbageCollection(): void {
    if (typeof global.gc === 'function') {
      const beforeGc = process.memoryUsage();
      const startTime = process.hrtime.bigint();

      try {
        global.gc();

        const afterGc = process.memoryUsage();
        const gcTime = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
        const freedMemory = (beforeGc.heapUsed - afterGc.heapUsed) / 1024 / 1024; // Convert to MB

        this.logger.log(
          `GC completed in ${gcTime.toFixed(2)}ms, freed ${freedMemory.toFixed(2)}MB`,
        );

        this.lastGcTime = Date.now();
      } catch (error) {
        this.logger.error('Failed to trigger garbage collection:', error);
      }
    } else {
      this.logger.warn('Garbage collection not available. Start Node.js with --expose-gc flag.');
    }
  }

  /**
   * Optimize large objects by clearing references
   */
  static optimizeObject<T extends Record<string, any>>(obj: T): void {
    if (!obj || typeof obj !== 'object') return;

    // Clear large arrays
    Object.keys(obj).forEach(key => {
      const value = obj[key];

      if (Array.isArray(value) && value.length > 1000) {
        this.logger.debug(`Clearing large array: ${key} (${value.length} items)`);
        (obj as any)[key] = [];
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively optimize nested objects
        this.optimizeObject(value);
      }
    });
  }

  /**
   * Create a memory-efficient stream processor
   */
  static createStreamProcessor<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    batchSize: number = 100,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);

          // Process batch
          await Promise.all(batch.map(processor));

          // Clear processed items from memory
          batch.length = 0;

          // Trigger GC periodically during large operations
          if (i % (batchSize * 10) === 0) {
            this.monitorMemory();
          }

          // Small delay to prevent blocking the event loop
          if (i + batchSize < items.length) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get current memory statistics
   */
  static getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsagePercent: number;
    recommendation: string;
  } {
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let recommendation = 'Memory usage is optimal';

    if (heapUsagePercent > 90) {
      recommendation = 'Critical: Consider increasing heap size or optimizing memory usage';
    } else if (heapUsagePercent > 80) {
      recommendation = 'Warning: High memory usage detected, monitor closely';
    } else if (heapUsagePercent > 60) {
      recommendation = 'Caution: Memory usage is elevated, consider optimization';
    }

    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
      recommendation,
    };
  }

  /**
   * Start periodic memory monitoring
   */
  static startMemoryMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    this.logger.log(`Starting memory monitoring (interval: ${intervalMs}ms)`);

    return setInterval(() => {
      this.monitorMemory();
    }, intervalMs);
  }

  /**
   * Create a memory-aware cache with automatic cleanup
   */
  static createMemoryAwareCache<K, V>(
    maxSize: number = 1000,
  ): Map<K, V> & {
    setWithMemoryCheck: (key: K, value: V) => void;
    getStats: () => { size: number; memoryUsage: number };
  } {
    const cache = new Map<K, V>();

    const enhanced = cache as Map<K, V> & {
      setWithMemoryCheck: (key: K, value: V) => void;
      getStats: () => { size: number; memoryUsage: number };
    };

    enhanced.setWithMemoryCheck = (key: K, value: V) => {
      // Check memory before adding
      const memStats = this.getMemoryStats();

      if (memStats.heapUsagePercent > 85) {
        this.logger.warn('High memory usage, clearing cache');
        cache.clear();
      } else if (cache.size >= maxSize) {
        // Remove oldest entries (FIFO)
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }

      cache.set(key, value);
    };

    enhanced.getStats = () => {
      const memUsage = JSON.stringify([...cache.values()]).length;
      return {
        size: cache.size,
        memoryUsage: Math.round(memUsage / 1024), // KB
      };
    };

    return enhanced;
  }
}
