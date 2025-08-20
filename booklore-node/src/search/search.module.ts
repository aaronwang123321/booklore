import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';
import { SearchFilterService } from './services/search-filter.service';
import { SearchAggregationService } from './services/search-aggregation.service';
import { SearchAnalyticsService } from './services/search-analytics.service';
import { FullTextSearchService } from './services/fulltext-search.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchFilterService,
    SearchAggregationService,
    SearchAnalyticsService,
    FullTextSearchService,
  ],
  exports: [
    SearchService,
    SearchFilterService,
    SearchAggregationService,
    SearchAnalyticsService,
    FullTextSearchService,
  ],
})
export class SearchModule {}
