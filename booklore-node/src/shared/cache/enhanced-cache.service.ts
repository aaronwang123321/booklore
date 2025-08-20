import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

interface CacheKeyInfo {
  key: string;
  ttl: number;
  size: number;
  type: string;
}

@Injectable()
export class EnhancedCacheService {
  private readonly logger = new Logger(EnhancedCacheService.name);
  private redis: Redis;
  private memoryCache = new Map<string, { value: any; expiry: number }>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
  };

  constructor(private configService: ConfigService) {
    this.initializeRedis();
  }

  private initializeRedis() {
    try {
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('error', error => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
    }
  }

  async get<T>(key: string, useMemoryCache = true): Promise<T | null> {
    try {
      // 首先检查内存缓存
      if (useMemoryCache) {
        const memoryResult = this.getFromMemory<T>(key);
        if (memoryResult !== null) {
          this.stats.hits++;
          this.updateHitRate();
          return memoryResult;
        }
      }

      // 检查Redis缓存
      const redisResult = await this.redis.get(key);
      if (redisResult) {
        const parsed = JSON.parse(redisResult);
        // 将结果存储到内存缓存
        if (useMemoryCache) {
          this.setToMemory(key, parsed, 300); // 5分钟内存缓存
        }
        this.stats.hits++;
        this.updateHitRate();
        return parsed;
      }

      this.stats.misses++;
      this.updateHitRate();
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl = 3600, useMemoryCache = true): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      // 设置Redis缓存
      await this.redis.setex(key, ttl, serialized);

      // 设置内存缓存
      if (useMemoryCache) {
        const memoryTtl = Math.min(ttl, 300); // 内存缓存最多5分钟
        this.setToMemory(key, value, memoryTtl);
      }

      this.stats.sets++;
      this.logger.debug(`Cache set for key: ${key}, TTL: ${ttl}`);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.memoryCache.delete(key);
      this.stats.deletes++;
      this.logger.debug(`Cache deleted for key: ${key}`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        // 清理内存缓存中匹配的键
        for (const key of this.memoryCache.keys()) {
          if (this.matchPattern(key, pattern)) {
            this.memoryCache.delete(key);
          }
        }
        this.stats.deletes += keys.length;
        this.logger.debug(`Cache deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Cache delete pattern error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  async warmup(
    keys: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>,
  ): Promise<void> {
    this.logger.log(`Starting cache warmup for ${keys.length} keys`);

    const promises = keys.map(async ({ key, fetcher, ttl = 3600 }) => {
      try {
        const existing = await this.get(key, false); // 不使用内存缓存检查
        if (!existing) {
          const value = await fetcher();
          await this.set(key, value, ttl);
          this.logger.debug(`Warmed up cache for key: ${key}`);
        }
      } catch (error) {
        this.logger.error(`Cache warmup error for key ${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
    this.logger.log('Cache warmup completed');
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
    };
    this.logger.log('Cache stats reset');
  }

  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
      this.memoryCache.clear();
      this.logger.log('Cache flushed');
    } catch (error) {
      this.logger.error('Cache flush error:', error);
      throw error;
    }
  }

  async getKeyInfo(key: string): Promise<CacheKeyInfo | null> {
    try {
      const ttl = await this.redis.ttl(key);
      if (ttl === -2) return null; // Key doesn't exist

      const value = await this.redis.get(key);
      const size = value ? Buffer.byteLength(value, 'utf8') : 0;
      const type = await this.redis.type(key);

      return {
        key,
        ttl: ttl === -1 ? -1 : ttl, // -1 means no expiry
        size,
        type,
      };
    } catch (error) {
      this.logger.error(`Get key info error for ${key}:`, error);
      return null;
    }
  }

  async healthCheck(): Promise<{ redis: boolean; memory: boolean }> {
    try {
      await this.redis.ping();
      return {
        redis: true,
        memory: this.memoryCache.size >= 0,
      };
    } catch (error) {
      this.logger.error('Cache health check failed:', error);
      return {
        redis: false,
        memory: this.memoryCache.size >= 0,
      };
    }
  }

  private getFromMemory<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    return item.value;
  }

  private setToMemory<T>(key: string, value: T, ttlSeconds: number): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.memoryCache.set(key, { value, expiry });

    // 清理过期的内存缓存项
    this.cleanupMemoryCache();
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, item] of this.memoryCache.entries()) {
      if (now > item.expiry) {
        this.memoryCache.delete(key);
      }
    }
  }

  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(key);
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}
