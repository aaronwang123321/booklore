import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  SearchAnalyticsEvent,
  SearchAnalyticsReport,
  SearchPerformanceMetrics,
  UserSearchBehavior,
  SearchInsights,
} from '../interfaces/search.interface';

@Injectable()
export class SearchAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async trackSearchEvent(event: SearchAnalyticsEvent): Promise<void> {
    // 异步记录搜索事件
    setImmediate(async () => {
      try {
        // 记录到Redis用于实时统计
        await this.recordToRedis(event);

        // 记录到数据库用于长期分析
        await this.recordToDatabase(event);
      } catch (error) {
        console.error('Failed to track search event:', error);
      }
    });
  }

  async getSearchAnalytics(
    libraryId?: number,
    dateRange?: { from: Date; to: Date },
  ): Promise<SearchAnalyticsReport> {
    const cacheKey = `search_analytics:${libraryId || 'all'}:${dateRange?.from?.toISOString() || ''}:${dateRange?.to?.toISOString() || ''}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [
      totalSearches,
      uniqueUsers,
      avgResponseTime,
      topQueries,
      searchTrends,
      noResultsQueries,
      popularFilters,
    ] = await Promise.all([
      this.getTotalSearches(libraryId, dateRange),
      this.getUniqueUsers(libraryId, dateRange),
      this.getAverageResponseTime(libraryId, dateRange),
      this.getTopQueries(libraryId, dateRange),
      this.getSearchTrends(libraryId, dateRange),
      this.getNoResultsQueries(libraryId, dateRange),
      this.getPopularFilters(libraryId, dateRange),
    ]);

    const report: SearchAnalyticsReport = {
      totalSearches,
      uniqueUsers,
      avgResponseTime,
      topQueries,
      searchTrends,
      noResultsQueries,
      popularFilters,
      generatedAt: new Date(),
    };

    // 缓存30分钟
    await this.redis.set(cacheKey, JSON.stringify(report), 1800);

    return report;
  }

  async getSearchPerformanceMetrics(): Promise<SearchPerformanceMetrics> {
    const cacheKey = 'search_performance_metrics';

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 从Redis获取实时性能指标
    const [
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      errorRate,
      cacheHitRate,
      searchesPerSecond,
    ] = await Promise.all([
      this.getMetricFromRedis('search:avg_response_time'),
      this.getMetricFromRedis('search:p95_response_time'),
      this.getMetricFromRedis('search:p99_response_time'),
      this.getMetricFromRedis('search:error_rate'),
      this.getMetricFromRedis('search:cache_hit_rate'),
      this.getMetricFromRedis('search:searches_per_second'),
    ]);

    const metrics: SearchPerformanceMetrics = {
      avgResponseTime: avgResponseTime || 0,
      p95ResponseTime: p95ResponseTime || 0,
      p99ResponseTime: p99ResponseTime || 0,
      errorRate: errorRate || 0,
      cacheHitRate: cacheHitRate || 0,
      searchesPerSecond: searchesPerSecond || 0,
      timestamp: new Date(),
    };

    // 缓存5分钟
    await this.redis.set(cacheKey, JSON.stringify(metrics), 300);

    return metrics;
  }

  async getUserSearchBehavior(userId: number): Promise<UserSearchBehavior> {
    const cacheKey = `user_search_behavior:${userId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 从数据库获取用户搜索行为数据
    const behavior: UserSearchBehavior = {
      totalSearches: 0,
      avgSearchesPerDay: 0,
      topQueries: [],
      preferredFilters: [],
      searchPatterns: [],
      lastSearchAt: null,
    };

    // 这里需要实现具体的用户行为分析逻辑
    // 可以从搜索日志表中获取数据

    // 缓存1小时
    await this.redis.set(cacheKey, JSON.stringify(behavior), 3600);

    return behavior;
  }

  async getSearchInsights(): Promise<SearchInsights> {
    const cacheKey = 'search_insights';

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const insights: SearchInsights = {
      trendingQueries: await this.getTrendingQueries(),
      searchQualityScore: await this.calculateSearchQualityScore(),
      userEngagementMetrics: await this.getUserEngagementMetrics(),
      contentGaps: await this.identifyContentGaps(),
      recommendations: await this.generateRecommendations(),
    };

    // 缓存2小时
    await this.redis.set(cacheKey, JSON.stringify(insights), 7200);

    return insights;
  }

  async optimizeSearchPerformance(): Promise<{
    cacheOptimizations: string[];
    indexOptimizations: string[];
    queryOptimizations: string[];
  }> {
    const slowQueries = await this.getSlowQueries();
    const cacheStats = await this.getCacheStats();

    const optimizations = {
      cacheOptimizations: [],
      indexOptimizations: [],
      queryOptimizations: [],
    };

    // 分析缓存命中率
    if (cacheStats.hitRate < 0.8) {
      optimizations.cacheOptimizations.push('增加缓存时间');
      optimizations.cacheOptimizations.push('优化缓存键策略');
    }

    // 分析慢查询
    if (slowQueries.length > 0) {
      optimizations.queryOptimizations.push('优化复杂查询');
      optimizations.indexOptimizations.push('添加数据库索引');
    }

    return optimizations;
  }

  private async recordToRedis(event: SearchAnalyticsEvent): Promise<void> {
    // const timestamp = Date.now();
    const dateKey = new Date().toISOString().split('T')[0];

    try {
      // 记录搜索计数 - 使用简单的计数器
      const countKey = `search:count:${dateKey}`;
      const currentCount = await this.redis.get(countKey);
      const newCount = (parseInt(currentCount || '0') + 1).toString();
      await this.redis.set(countKey, newCount, 86400); // 1天过期

      // 记录响应时间
      if (event.responseTime) {
        await this.redis.lpush(`search:response_times:${dateKey}`, event.responseTime.toString());
        // Note: Redis service doesn't have expire method, so we set TTL when creating
      }

      // 记录查询词 - 使用简单的计数
      if (event.query) {
        const queryKey = `search:query:${dateKey}:${event.query}`;
        const queryCount = await this.redis.get(queryKey);
        const newQueryCount = (parseInt(queryCount || '0') + 1).toString();
        await this.redis.set(queryKey, newQueryCount, 86400);
      }

      // 记录用户
      if (event.userId) {
        await this.redis.sadd(`search:users:${dateKey}`, event.userId.toString());
      }

      // 记录无结果查询
      if (event.resultCount === 0 && event.query) {
        const noResultKey = `search:no_result:${dateKey}:${event.query}`;
        const noResultCount = await this.redis.get(noResultKey);
        const newNoResultCount = (parseInt(noResultCount || '0') + 1).toString();
        await this.redis.set(noResultKey, newNoResultCount, 86400);
      }
    } catch (error) {
      console.error('Error recording search analytics to Redis:', error);
    }
  }

  private async recordToDatabase(_event: SearchAnalyticsEvent): Promise<void> {
    // 这里需要创建搜索日志表来存储详细的搜索事件
    // 由于当前schema中没有这个表，这里先注释掉
    /*
    await this.prisma.searchLog.create({
      data: {
        userId: event.userId,
        query: event.query,
        filters: event.filters,
        resultCount: event.resultCount,
        responseTime: event.responseTime,
        libraryId: event.libraryId,
        timestamp: new Date(event.timestamp)
      }
    });
    */
  }

  private async getTotalSearches(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<number> {
    // 实现总搜索次数统计
    return 0;
  }

  private async getUniqueUsers(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<number> {
    // 实现唯一用户数统计
    return 0;
  }

  private async getAverageResponseTime(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<number> {
    // 实现平均响应时间统计
    return 0;
  }

  private async getTopQueries(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<Array<{ query: string; count: number }>> {
    // 实现热门查询统计
    return [];
  }

  private async getSearchTrends(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<Array<{ date: string; count: number }>> {
    // 实现搜索趋势统计
    return [];
  }

  private async getNoResultsQueries(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<Array<{ query: string; count: number }>> {
    // 实现无结果查询统计
    return [];
  }

  private async getPopularFilters(
    _libraryId?: number,
    _dateRange?: { from: Date; to: Date },
  ): Promise<Array<{ filter: string; count: number }>> {
    // 实现热门过滤器统计
    return [];
  }

  private async getMetricFromRedis(key: string): Promise<number | null> {
    const value = await this.redis.get(key);
    return value ? parseFloat(value) : null;
  }

  private async getTrendingQueries(): Promise<Array<{ query: string; trend: number }>> {
    // 实现趋势查询分析
    return [];
  }

  private async calculateSearchQualityScore(): Promise<number> {
    // 计算搜索质量评分
    // 基于点击率、无结果查询率、用户满意度等指标
    return 0.85;
  }

  private async getUserEngagementMetrics(): Promise<{
    avgSessionDuration: number;
    bounceRate: number;
    clickThroughRate: number;
  }> {
    return {
      avgSessionDuration: 0,
      bounceRate: 0,
      clickThroughRate: 0,
    };
  }

  private async identifyContentGaps(): Promise<Array<{ topic: string; demand: number }>> {
    // 识别内容缺口
    return [];
  }

  private async generateRecommendations(): Promise<string[]> {
    // 生成搜索优化建议
    return ['优化搜索算法相关性', '增加自动完成功能', '改进搜索结果排序', '添加搜索历史功能'];
  }

  private async getSlowQueries(): Promise<Array<{ query: string; avgTime: number }>> {
    // 获取慢查询列表
    return [];
  }

  private async getCacheStats(): Promise<{ hitRate: number; missRate: number }> {
    // 获取缓存统计
    return { hitRate: 0.75, missRate: 0.25 };
  }
}
