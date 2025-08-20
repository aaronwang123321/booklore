import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.client = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB', 0),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('🔴 Redis connected successfully');
      });

      this.client.on('error', error => {
        this.isConnected = false;
        this.logger.error('Redis connection error:', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('🔴 Redis disconnected');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  // Cache operations with TTL
  async get(key: string): Promise<string | null> {
    try {
      if (!this.isHealthy()) return null;
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      this.logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    try {
      if (!this.isHealthy()) return keys.map(() => null);
      return await this.client.mget(...keys);
    } catch (error) {
      this.logger.error(`Redis MGET error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, string>, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;

      const pipeline = this.client.pipeline();

      Object.entries(keyValuePairs).forEach(([key, value]) => {
        if (ttlSeconds) {
          pipeline.setex(key, ttlSeconds, value);
        } else {
          pipeline.set(key, value);
        }
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.error('Redis MSET error:', error);
      return false;
    }
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    try {
      if (!this.isHealthy()) return null;
      return await this.client.hget(key, field);
    } catch (error) {
      this.logger.error(`Redis HGET error for key ${key}, field ${field}:`, error);
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;
      await this.client.hset(key, field, value);
      return true;
    } catch (error) {
      this.logger.error(`Redis HSET error for key ${key}, field ${field}:`, error);
      return false;
    }
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    try {
      if (!this.isHealthy()) return null;
      return await this.client.hgetall(key);
    } catch (error) {
      this.logger.error(`Redis HGETALL error for key ${key}:`, error);
      return null;
    }
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      if (!this.isHealthy()) return 0;
      return await this.client.lpush(key, ...values);
    } catch (error) {
      this.logger.error(`Redis LPUSH error for key ${key}:`, error);
      return 0;
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      if (!this.isHealthy()) return null;
      return await this.client.rpop(key);
    } catch (error) {
      this.logger.error(`Redis RPOP error for key ${key}:`, error);
      return null;
    }
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isHealthy()) return 0;
      return await this.client.sadd(key, ...members);
    } catch (error) {
      this.logger.error(`Redis SADD error for key ${key}:`, error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      if (!this.isHealthy()) return [];
      return await this.client.smembers(key);
    } catch (error) {
      this.logger.error(`Redis SMEMBERS error for key ${key}:`, error);
      return [];
    }
  }

  // Buffer operations for binary data (images, files)
  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      if (!this.isHealthy()) return null;
      const result = await this.client.getBuffer(key);
      return result;
    } catch (error) {
      this.logger.error(`Redis GETBUFFER error for key ${key}:`, error);
      return null;
    }
  }

  async setBuffer(key: string, value: Buffer, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isHealthy()) return false;

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Redis SETBUFFER error for key ${key}:`, error);
      return false;
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      if (!this.isHealthy()) return 0;

      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      return await this.client.del(...keys);
    } catch (error) {
      this.logger.error(`Redis pattern invalidation error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    return this.invalidatePattern(pattern);
  }

  // Performance monitoring
  async getStats(): Promise<any> {
    try {
      if (!this.isHealthy()) return null;

      const info = await this.client.info();
      const memory = await this.client.info('memory');
      const stats = await this.client.info('stats');

      return {
        connected: this.isConnected,
        status: this.client.status,
        info: this.parseRedisInfo(info),
        memory: this.parseRedisInfo(memory),
        stats: this.parseRedisInfo(stats),
      };
    } catch (error) {
      this.logger.error('Redis stats error:', error);
      return null;
    }
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    info.split('\r\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });
    return result;
  }
}
