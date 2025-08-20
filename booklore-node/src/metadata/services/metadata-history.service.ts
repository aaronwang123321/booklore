import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { MetadataHistory, MetadataSource } from '../interfaces/metadata.interface';
import { MetadataHistoryQueryDto, RollbackMetadataDto } from '../dto/metadata.dto';

@Injectable()
export class MetadataHistoryService {
  private readonly logger = new Logger(MetadataHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a metadata change in history
   */
  async recordChange(
    bookId: number,
    fieldName: string,
    oldValue: any,
    newValue: any,
    source: MetadataSource | 'manual',
    userId: number,
    reason?: string,
  ): Promise<MetadataHistory> {
    try {
      const historyEntry = await this.prisma.metadataHistory.create({
        data: {
          bookId,
          fieldName,
          oldValue: this.serializeValue(oldValue),
          newValue: this.serializeValue(newValue),
          source,
          userId,
          reason,
          timestamp: new Date(),
        },
      });

      this.logger.log(`Recorded metadata change for book ${bookId}, field ${fieldName}`);
      return this.mapToInterface(historyEntry);
    } catch (error) {
      this.logger.error(`Error recording metadata change: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record multiple metadata changes in a single transaction
   */
  async recordBulkChanges(
    bookId: number,
    changes: Record<string, { oldValue: any; newValue: any }>,
    source: MetadataSource | 'manual',
    userId: number,
    reason?: string,
  ): Promise<MetadataHistory[]> {
    try {
      const historyEntries = await this.prisma.$transaction(
        Object.entries(changes).map(([fieldName, { oldValue, newValue }]) =>
          this.prisma.metadataHistory.create({
            data: {
              bookId,
              fieldName,
              oldValue: this.serializeValue(oldValue),
              newValue: this.serializeValue(newValue),
              source,
              userId,
              reason,
              timestamp: new Date(),
            },
          }),
        ),
      );

      this.logger.log(`Recorded ${historyEntries.length} metadata changes for book ${bookId}`);
      return historyEntries.map(entry => this.mapToInterface(entry));
    } catch (error) {
      this.logger.error(`Error recording bulk metadata changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get metadata history for a book or field
   */
  async getHistory(query: MetadataHistoryQueryDto): Promise<{
    history: MetadataHistory[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const where: any = {};

      if (query.bookId) where.bookId = query.bookId;
      if (query.fieldName) where.fieldName = query.fieldName;
      if (query.userId) where.userId = query.userId;

      if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) where.timestamp.gte = new Date(query.startDate);
        if (query.endDate) where.timestamp.lte = new Date(query.endDate);
      }

      const [history, total] = await Promise.all([
        this.prisma.metadataHistory.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            book: {
              select: { id: true, title: true, author: true },
            },
          },
        }),
        this.prisma.metadataHistory.count({ where }),
      ]);

      return {
        history: history.map(entry => this.mapToInterface(entry)),
        total,
        page: query.page,
        limit: query.limit,
      };
    } catch (error) {
      this.logger.error(`Error getting metadata history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the complete change history for a specific book
   */
  async getBookHistory(bookId: number): Promise<MetadataHistory[]> {
    try {
      const history = await this.prisma.metadataHistory.findMany({
        where: { bookId },
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return history.map(entry => this.mapToInterface(entry));
    } catch (error) {
      this.logger.error(`Error getting book history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rollback metadata to a specific point in history
   */
  async rollbackToHistory(
    historyId: number,
    userId: number,
    rollbackDto: RollbackMetadataDto,
  ): Promise<void> {
    try {
      // Get the history entry
      const historyEntry = await this.prisma.metadataHistory.findUnique({
        where: { id: historyId },
        include: { book: true },
      });

      if (!historyEntry) {
        throw new NotFoundException(`History entry ${historyId} not found`);
      }

      const book = historyEntry.book;
      const fieldName = historyEntry.fieldName;
      const rollbackValue = this.deserializeValue(historyEntry.oldValue);
      const currentValue = this.getCurrentFieldValue(book, fieldName);

      // Update the book with the rollback value
      await this.prisma.$transaction(async tx => {
        // Update the book field
        const updateData: any = {};
        updateData[fieldName] = rollbackValue;

        await tx.book.update({
          where: { id: book.id },
          data: updateData,
        });

        // Record the rollback in history
        await tx.metadataHistory.create({
          data: {
            bookId: book.id,
            fieldName,
            oldValue: this.serializeValue(currentValue),
            newValue: this.serializeValue(rollbackValue),
            source: 'manual',
            userId,
            reason: `Rollback to history entry ${historyId}: ${rollbackDto.reason || 'No reason provided'}`,
            timestamp: new Date(),
          },
        });
      });

      this.logger.log(
        `Rolled back book ${book.id} field ${fieldName} to history entry ${historyId}`,
      );
    } catch (error) {
      this.logger.error(`Error rolling back metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rollback all changes made after a specific timestamp
   */
  async rollbackToTimestamp(
    bookId: number,
    timestamp: Date,
    userId: number,
    reason?: string,
  ): Promise<void> {
    try {
      // Get all changes after the timestamp
      const changesToRollback = await this.prisma.metadataHistory.findMany({
        where: {
          bookId,
          timestamp: { gt: timestamp },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (changesToRollback.length === 0) {
        this.logger.log(`No changes to rollback for book ${bookId} after ${timestamp}`);
        return;
      }

      // Group changes by field and get the oldest value for each field
      const fieldRollbacks: Record<string, any> = {};
      const processedFields = new Set<string>();

      for (const change of changesToRollback.reverse()) {
        // Process in chronological order
        if (!processedFields.has(change.fieldName)) {
          fieldRollbacks[change.fieldName] = this.deserializeValue(change.oldValue);
          processedFields.add(change.fieldName);
        }
      }

      // Apply rollbacks
      await this.prisma.$transaction(async tx => {
        // Update book fields
        if (Object.keys(fieldRollbacks).length > 0) {
          await tx.book.update({
            where: { id: bookId },
            data: fieldRollbacks,
          });
        }

        // Record rollback entries
        for (const [fieldName, rollbackValue] of Object.entries(fieldRollbacks)) {
          const book = await tx.book.findUnique({ where: { id: bookId } });
          const currentValue = this.getCurrentFieldValue(book, fieldName);

          await tx.metadataHistory.create({
            data: {
              bookId,
              fieldName,
              oldValue: this.serializeValue(currentValue),
              newValue: this.serializeValue(rollbackValue),
              source: 'manual',
              userId,
              reason: `Bulk rollback to ${timestamp.toISOString()}: ${reason || 'No reason provided'}`,
              timestamp: new Date(),
            },
          });
        }
      });

      this.logger.log(
        `Rolled back ${Object.keys(fieldRollbacks).length} fields for book ${bookId} to ${timestamp}`,
      );
    } catch (error) {
      this.logger.error(`Error rolling back to timestamp: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get statistics about metadata changes
   */
  async getChangeStatistics(
    bookId?: number,
    userId?: number,
  ): Promise<{
    totalChanges: number;
    changesBySource: Record<string, number>;
    changesByField: Record<string, number>;
    changesByUser: Record<string, number>;
    recentActivity: { date: string; count: number }[];
  }> {
    try {
      const where: any = {};
      if (bookId) where.bookId = bookId;
      if (userId) where.userId = userId;

      const [totalChanges, changesBySource, changesByField, changesByUser, recentActivity] =
        await Promise.all([
          this.prisma.metadataHistory.count({ where }),
          this.prisma.metadataHistory.groupBy({
            by: ['source'],
            where,
            _count: { source: true },
          }),
          this.prisma.metadataHistory.groupBy({
            by: ['fieldName'],
            where,
            _count: { fieldName: true },
          }),
          this.prisma.metadataHistory.groupBy({
            by: ['userId'],
            where,
            _count: { userId: true },
          }),
          this.prisma.$queryRaw`
          SELECT DATE(timestamp) as date, COUNT(*) as count
          FROM metadata_history
          ${bookId ? `WHERE book_id = ${bookId}` : ''}
          ${userId ? `${bookId ? 'AND' : 'WHERE'} user_id = ${userId}` : ''}
          AND timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(timestamp)
          ORDER BY date DESC
        `,
        ]);

      return {
        totalChanges,
        changesBySource: Object.fromEntries(
          changesBySource.map(item => [item.source, item._count.source]),
        ),
        changesByField: Object.fromEntries(
          changesByField.map(item => [item.fieldName, item._count.fieldName]),
        ),
        changesByUser: Object.fromEntries(
          changesByUser.map(item => [item.userId.toString(), item._count.userId]),
        ),
        recentActivity: (recentActivity as any[]).map(item => ({
          date: item.date,
          count: parseInt(item.count),
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting change statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up old history entries
   */
  async cleanupOldHistory(olderThanDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.metadataHistory.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} old history entries older than ${olderThanDays} days`,
      );
      return result.count;
    } catch (error) {
      this.logger.error(`Error cleaning up old history: ${error.message}`);
      throw error;
    }
  }

  private serializeValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  }

  private deserializeValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  private getCurrentFieldValue(book: any, fieldName: string): any {
    return book[fieldName];
  }

  private mapToInterface(entry: any): MetadataHistory {
    return {
      id: entry.id,
      bookId: entry.bookId,
      fieldName: entry.fieldName,
      oldValue: this.deserializeValue(entry.oldValue),
      newValue: this.deserializeValue(entry.newValue),
      source: entry.source,
      userId: entry.userId,
      timestamp: entry.timestamp,
      reason: entry.reason,
    };
  }
}
