export interface SearchRequest {
  query?: string;
  page: number;
  pageSize: number;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  filters?: SearchFilters;
  timestamp?: number;
  userId?: number;
}

export interface SearchFilters {
  libraryIds?: number[];
  shelfIds?: number[];
  authors?: string[];
  publishers?: string[];
  languages?: string[];
  fileTypes?: string[];
  status?: string[];
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  fileSizeRange?: {
    min?: number;
    max?: number;
  };
  hasMetadata?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  aggregations: SearchAggregations;
  searchTime: number;
}

export interface SearchResult {
  id: number;
  title: string;
  author?: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishDate?: Date;
  description?: string;
  fileType: string;
  fileSize: number;
  coverImage?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  library: {
    id: number;
    name: string;
  };
  shelf?: {
    id: number;
    name: string;
  };
  metadata?: any;
}

export interface SearchAggregations {
  authors: Array<{ value: string; count: number }>;
  publishers: Array<{ value: string; count: number }>;
  languages: Array<{ value: string; count: number }>;
  fileTypes: Array<{ value: string; count: number }>;
  libraries: Array<{ value: string; count: number; id: number }>;
  status: Array<{ value: string; count: number }>;
}

export interface SearchSuggestion {
  text: string;
  type: 'title' | 'author' | 'publisher';
}

// Advanced search interfaces
export interface AdvancedSearchRequest {
  filterGroups?: FilterGroup[];
  fullTextSearch?: string;
  metadataSearch?: any;
}

export interface FilterGroup {
  operator: 'AND' | 'OR';
  filters: FilterValue[];
}

export interface FilterValue {
  field: string;
  operator: string;
  value: any;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptions {
  authors: FilterOption[];
  publishers: FilterOption[];
  languages: FilterOption[];
  fileTypes: FilterOption[];
  libraries: FilterOption[];
  shelves: FilterOption[];
  dateRange?: { min: Date; max: Date };
  fileSizeRange?: { min: number; max: number };
  status: FilterOption[];
}

export interface FilterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Aggregation interfaces
export interface AggregationRequest {
  aggregations: Record<string, AggregationConfig>;
  filters?: any;
  timestamp?: number;
}

export interface AggregationConfig {
  type: 'terms' | 'date_histogram' | 'range' | 'stats';
}

export interface TermsAggregation extends AggregationConfig {
  type: 'terms';
  field: string;
  size?: number;
  orderBy?: 'count' | 'key';
  order?: 'asc' | 'desc';
}

export interface DateHistogramAggregation extends AggregationConfig {
  type: 'date_histogram';
  field: string;
  calendar_interval?: string;
  fixed_interval?: string;
}

export interface RangeAggregation extends AggregationConfig {
  type: 'range';
  field: string;
  ranges: Array<{
    key?: string;
    from?: number;
    to?: number;
  }>;
}

export interface StatsAggregation extends AggregationConfig {
  type: 'stats';
  field: string;
}

export interface AggregationResponse {
  aggregations: Record<string, any>;
  totalCount: number;
  executionTime: number;
}

export interface AggregationBucket {
  key: string;
  key_as_string?: string;
  doc_count: number;
  from?: number;
  to?: number;
}

// Analytics interfaces
export interface SearchAnalyticsEvent {
  userId?: number;
  query?: string;
  filters?: any;
  resultCount?: number;
  responseTime?: number;
  libraryId?: number;
  timestamp: number;
}

export interface SearchAnalyticsReport {
  totalSearches: number;
  uniqueUsers: number;
  avgResponseTime: number;
  topQueries: Array<{ query: string; count: number }>;
  searchTrends: Array<{ date: string; count: number }>;
  noResultsQueries: Array<{ query: string; count: number }>;
  popularFilters: Array<{ filter: string; count: number }>;
  generatedAt: Date;
}

export interface SearchPerformanceMetrics {
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  searchesPerSecond: number;
  timestamp: Date;
}

export interface UserSearchBehavior {
  totalSearches: number;
  avgSearchesPerDay: number;
  topQueries: Array<{ query: string; count: number }>;
  preferredFilters: Array<{ filter: string; usage: number }>;
  searchPatterns: Array<{ pattern: string; frequency: number }>;
  lastSearchAt?: Date;
}

export interface SearchInsights {
  trendingQueries: Array<{ query: string; trend: number }>;
  searchQualityScore: number;
  userEngagementMetrics: {
    avgSessionDuration: number;
    bounceRate: number;
    clickThroughRate: number;
  };
  contentGaps: Array<{ topic: string; demand: number }>;
  recommendations: string[];
}
