import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../redis/redis.service';
import { CACHE_KEY, CACHE_TTL } from './cache.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheKey = this.reflector.get<string>(CACHE_KEY, context.getHandler());
    const cacheTtl = this.reflector.get<number>(CACHE_TTL, context.getHandler());
    const keyGenerator = this.reflector.get<(...args: any[]) => string>(
      'cache_key_generator',
      context.getHandler(),
    );

    if (!cacheKey && !keyGenerator) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const finalKey = this.generateCacheKey(cacheKey, keyGenerator, request, context);

    try {
      // Try to get from cache
      const cachedResult = await this.redisService.get(finalKey);
      if (cachedResult) {
        this.logger.debug(`Cache HIT for key: ${finalKey}`);
        return of(JSON.parse(cachedResult));
      }

      this.logger.debug(`Cache MISS for key: ${finalKey}`);

      // Execute the method and cache the result
      return next.handle().pipe(
        tap(async result => {
          if (result !== undefined && result !== null) {
            await this.redisService.set(finalKey, JSON.stringify(result), cacheTtl);
            this.logger.debug(`Cached result for key: ${finalKey} with TTL: ${cacheTtl}s`);
          }
        }),
      );
    } catch (error) {
      this.logger.error(`Cache error for key ${finalKey}:`, error);
      return next.handle();
    }
  }

  private generateCacheKey(
    baseKey: string,
    keyGenerator: ((...args: any[]) => string) | undefined,
    request: any,
    context: ExecutionContext,
  ): string {
    if (keyGenerator) {
      const args = context.getArgs();
      return keyGenerator(...args);
    }

    const userId = request.user?.id || 'anonymous';
    const method = request.method;
    const url = request.url;
    const query = JSON.stringify(request.query || {});

    return `${baseKey}:${method}:${url}:${userId}:${Buffer.from(query).toString('base64')}`;
  }
}
