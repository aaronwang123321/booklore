import { Injectable, Logger } from '@nestjs/common';
import {
  ExternalMetadata,
  MetadataMatchResult,
  MetadataSearchQuery,
} from '../interfaces/metadata.interface';

@Injectable()
export class MetadataMatcherService {
  private readonly logger = new Logger(MetadataMatcherService.name);

  /**
   * Find the best match from multiple metadata sources
   */
  findBestMatch(query: MetadataSearchQuery, allResults: ExternalMetadata[]): MetadataMatchResult {
    if (allResults.length === 0) {
      return {
        bestMatch: null,
        allMatches: [],
        confidence: 0,
        reasoning: ['No metadata found from any source'],
      };
    }

    // Score each result
    const scoredResults = allResults.map(result => ({
      metadata: result,
      score: this.calculateMatchScore(query, result),
      reasoning: this.generateReasoningForMatch(query, result),
    }));

    // Sort by score (highest first)
    scoredResults.sort((a, b) => b.score - a.score);

    const bestMatch = scoredResults[0];
    const reasoning = [
      `Found ${allResults.length} potential matches`,
      `Best match has confidence score: ${bestMatch.score.toFixed(2)}`,
      ...bestMatch.reasoning,
    ];

    // Add source diversity reasoning
    const sources = [...new Set(allResults.map(r => r.source))];
    if (sources.length > 1) {
      reasoning.push(`Results found from ${sources.length} sources: ${sources.join(', ')}`);
    }

    return {
      bestMatch: bestMatch.metadata,
      allMatches: scoredResults.map(r => r.metadata),
      confidence: bestMatch.score,
      reasoning,
    };
  }

  /**
   * Calculate match score for a metadata result against the query
   */
  private calculateMatchScore(query: MetadataSearchQuery, metadata: ExternalMetadata): number {
    let score = metadata.confidence || 0.5; // Start with provider confidence
    const factors: { name: string; weight: number; score: number }[] = [];

    // Title matching (weight: 0.4)
    if (query.title && metadata.title) {
      const titleScore = this.calculateStringSimilarity(
        this.normalizeString(query.title),
        this.normalizeString(metadata.title),
      );
      factors.push({ name: 'title', weight: 0.4, score: titleScore });
    }

    // Author matching (weight: 0.3)
    if (query.author && metadata.author) {
      const authorScore = this.calculateStringSimilarity(
        this.normalizeString(query.author),
        this.normalizeString(metadata.author),
      );
      factors.push({ name: 'author', weight: 0.3, score: authorScore });
    }

    // ISBN matching (weight: 0.2) - exact match is very strong
    if (query.isbn && metadata.isbn) {
      const queryIsbn = this.normalizeIsbn(query.isbn);
      const metadataIsbn = this.normalizeIsbn(metadata.isbn);
      const isbnScore = queryIsbn === metadataIsbn ? 1.0 : 0.0;
      factors.push({ name: 'isbn', weight: 0.2, score: isbnScore });
    }

    // Language matching (weight: 0.05)
    if (query.language && metadata.language) {
      const langScore =
        query.language.toLowerCase() === metadata.language.toLowerCase() ? 1.0 : 0.0;
      factors.push({ name: 'language', weight: 0.05, score: langScore });
    }

    // Year matching (weight: 0.05)
    if (query.year && metadata.publishDate) {
      const metadataYear = metadata.publishDate.getFullYear();
      const yearDiff = Math.abs(query.year - metadataYear);
      const yearScore = yearDiff === 0 ? 1.0 : Math.max(0, 1 - yearDiff / 5); // Tolerance of 5 years
      factors.push({ name: 'year', weight: 0.05, score: yearScore });
    }

    // Calculate weighted score
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight > 0) {
      const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;
      score = (score + weightedScore) / 2; // Average with provider confidence
    }

    // Bonus for complete metadata
    const completenessBonus = this.calculateCompletenessBonus(metadata);
    score = Math.min(1.0, score + completenessBonus);

    // Penalty for very low provider confidence
    if (metadata.confidence < 0.3) {
      score *= 0.8;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    const distance = matrix[str2.length][str1.length];
    return 1 - distance / maxLength;
  }

  /**
   * Normalize string for comparison
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Normalize ISBN for comparison
   */
  private normalizeIsbn(isbn: string): string {
    return isbn.replace(/[-\s]/g, '');
  }

  /**
   * Calculate completeness bonus based on available metadata fields
   */
  private calculateCompletenessBonus(metadata: ExternalMetadata): number {
    const fields = [
      'title',
      'author',
      'isbn',
      'publisher',
      'publishDate',
      'description',
      'coverImageUrl',
      'genres',
      'pageCount',
    ];

    const filledFields = fields.filter(field => {
      const value = metadata[field as keyof ExternalMetadata];
      return value !== null && value !== undefined && value !== '';
    });

    const completeness = filledFields.length / fields.length;
    return completeness * 0.1; // Max 10% bonus for completeness
  }

  /**
   * Generate reasoning for why a match was selected
   */
  private generateReasoningForMatch(
    query: MetadataSearchQuery,
    metadata: ExternalMetadata,
  ): string[] {
    const reasoning: string[] = [];

    // Title match reasoning
    if (query.title && metadata.title) {
      const similarity = this.calculateStringSimilarity(
        this.normalizeString(query.title),
        this.normalizeString(metadata.title),
      );
      if (similarity > 0.8) {
        reasoning.push(`Strong title match (${(similarity * 100).toFixed(0)}% similarity)`);
      } else if (similarity > 0.5) {
        reasoning.push(`Moderate title match (${(similarity * 100).toFixed(0)}% similarity)`);
      } else {
        reasoning.push(`Weak title match (${(similarity * 100).toFixed(0)}% similarity)`);
      }
    }

    // Author match reasoning
    if (query.author && metadata.author) {
      const similarity = this.calculateStringSimilarity(
        this.normalizeString(query.author),
        this.normalizeString(metadata.author),
      );
      if (similarity > 0.8) {
        reasoning.push(`Strong author match (${(similarity * 100).toFixed(0)}% similarity)`);
      } else if (similarity > 0.5) {
        reasoning.push(`Moderate author match (${(similarity * 100).toFixed(0)}% similarity)`);
      }
    }

    // ISBN match reasoning
    if (query.isbn && metadata.isbn) {
      const queryIsbn = this.normalizeIsbn(query.isbn);
      const metadataIsbn = this.normalizeIsbn(metadata.isbn);
      if (queryIsbn === metadataIsbn) {
        reasoning.push('Exact ISBN match');
      }
    }

    // Source confidence
    if (metadata.confidence > 0.8) {
      reasoning.push(`High source confidence (${(metadata.confidence * 100).toFixed(0)}%)`);
    } else if (metadata.confidence > 0.6) {
      reasoning.push(`Medium source confidence (${(metadata.confidence * 100).toFixed(0)}%)`);
    } else {
      reasoning.push(`Low source confidence (${(metadata.confidence * 100).toFixed(0)}%)`);
    }

    // Completeness
    const completeness = this.calculateCompletenessBonus(metadata) * 10; // Convert back to percentage
    if (completeness > 0.7) {
      reasoning.push('Rich metadata available');
    } else if (completeness > 0.4) {
      reasoning.push('Moderate metadata available');
    } else {
      reasoning.push('Limited metadata available');
    }

    return reasoning;
  }

  /**
   * Merge metadata from multiple sources intelligently
   */
  mergeMetadata(metadataList: ExternalMetadata[]): ExternalMetadata {
    if (metadataList.length === 0) {
      throw new Error('Cannot merge empty metadata list');
    }

    if (metadataList.length === 1) {
      return metadataList[0];
    }

    // Start with the highest confidence metadata as base
    const sortedByConfidence = [...metadataList].sort((a, b) => b.confidence - a.confidence);
    const merged = { ...sortedByConfidence[0] };

    // Merge fields from other sources, preferring higher confidence sources
    for (const metadata of sortedByConfidence.slice(1)) {
      // Only override if the field is empty or the new source has higher confidence
      if (!merged.isbn && metadata.isbn) merged.isbn = metadata.isbn;
      if (!merged.publisher && metadata.publisher) merged.publisher = metadata.publisher;
      if (!merged.publishDate && metadata.publishDate) merged.publishDate = metadata.publishDate;
      if (!merged.description && metadata.description) merged.description = metadata.description;
      if (!merged.coverImageUrl && metadata.coverImageUrl)
        merged.coverImageUrl = metadata.coverImageUrl;
      if (!merged.pageCount && metadata.pageCount) merged.pageCount = metadata.pageCount;

      // Merge genres
      if (metadata.genres && metadata.genres.length > 0) {
        const existingGenres = merged.genres || [];
        const newGenres = metadata.genres.filter(g => !existingGenres.includes(g));
        merged.genres = [...existingGenres, ...newGenres];
      }

      // Use higher rating if available
      if (!merged.rating && metadata.rating) {
        merged.rating = metadata.rating;
      } else if (merged.rating && metadata.rating && metadata.confidence > merged.confidence) {
        merged.rating = metadata.rating;
      }
    }

    // Update confidence to average of all sources
    merged.confidence =
      metadataList.reduce((sum, m) => sum + m.confidence, 0) / metadataList.length;

    // Mark as merged
    merged.source = 'merged' as any;
    merged.rawData = {
      sources: metadataList.map(m => m.source),
      originalData: metadataList.map(m => m.rawData),
    };

    return merged;
  }
}
