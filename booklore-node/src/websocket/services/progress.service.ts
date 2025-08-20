import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProgressGateway } from '../gateways/progress.gateway';

export interface FileProcessingEvent {
  jobId: string;
  userId: string;
  progress?: number;
  result?: any;
  error?: string;
}

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(private readonly progressGateway: ProgressGateway) {}

  @OnEvent('file.processing.started')
  async handleFileProcessingStarted(event: FileProcessingEvent & { fileName: string }) {
    this.logger.log(`File processing started: ${event.jobId} for user ${event.userId}`);

    await this.progressGateway.notifyFileProcessingStarted(
      parseInt(event.userId),
      event.jobId,
      event.fileName,
    );
  }

  @OnEvent('file.processing.progress')
  async handleFileProcessingProgress(event: FileProcessingEvent) {
    this.logger.log(`File processing progress: ${event.jobId} - ${event.progress}%`);

    await this.progressGateway.notifyFileProcessingProgress(
      parseInt(event.userId),
      event.jobId,
      event.progress || 0,
    );
  }

  @OnEvent('file.processing.completed')
  async handleFileProcessingCompleted(event: FileProcessingEvent) {
    this.logger.log(`File processing completed: ${event.jobId} for user ${event.userId}`);

    await this.progressGateway.notifyFileProcessingCompleted(
      parseInt(event.userId),
      event.jobId,
      event.result,
    );
  }

  @OnEvent('file.processing.failed')
  async handleFileProcessingFailed(event: FileProcessingEvent) {
    this.logger.error(
      `File processing failed: ${event.jobId} for user ${event.userId} - ${event.error}`,
    );

    await this.progressGateway.notifyFileProcessingFailed(
      parseInt(event.userId),
      event.jobId,
      event.error || 'Unknown error',
    );
  }

  @OnEvent('book.metadata.updated')
  async handleBookMetadataUpdated(event: { bookId: number; userId: number; metadata: any }) {
    this.logger.log(`Book metadata updated: ${event.bookId} for user ${event.userId}`);

    // Notify user about metadata update
    await this.progressGateway.notifyProgress({
      jobId: `metadata-${event.bookId}`,
      userId: event.userId,
      progress: 100,
      status: 'completed',
      message: 'Book metadata updated',
      data: {
        bookId: event.bookId,
        metadata: event.metadata,
      },
    });
  }

  @OnEvent('book.cover.extracted')
  async handleBookCoverExtracted(event: { bookId: number; userId: number; coverUrl: string }) {
    this.logger.log(`Book cover extracted: ${event.bookId} for user ${event.userId}`);

    // Notify user about cover extraction
    await this.progressGateway.notifyProgress({
      jobId: `cover-${event.bookId}`,
      userId: event.userId,
      progress: 100,
      status: 'completed',
      message: 'Book cover extracted',
      data: {
        bookId: event.bookId,
        coverUrl: event.coverUrl,
      },
    });
  }

  @OnEvent('library.book.added')
  async handleLibraryBookAdded(event: { libraryId: number; bookId: number; userId: number }) {
    this.logger.log(`Book added to library: ${event.bookId} in library ${event.libraryId}`);

    // Notify all users in the library about the new book
    // This would require library membership validation in a real implementation
    await this.progressGateway.notifyProgress({
      jobId: `library-update-${event.libraryId}-${Date.now()}`,
      userId: event.userId,
      progress: 100,
      status: 'completed',
      message: 'New book added to library',
      data: {
        libraryId: event.libraryId,
        bookId: event.bookId,
        action: 'book_added',
      },
    });
  }

  @OnEvent('reading.progress.updated')
  async handleReadingProgressUpdated(event: {
    bookId: number;
    userId: number;
    progress: number;
    chapter?: string;
    position?: any;
  }) {
    this.logger.log(
      `Reading progress updated: ${event.bookId} for user ${event.userId} - ${event.progress}%`,
    );

    // Notify user about reading progress sync across devices
    await this.progressGateway.notifyProgress({
      jobId: `reading-${event.bookId}`,
      userId: event.userId,
      progress: event.progress,
      status: 'progress',
      message: 'Reading progress synchronized',
      data: {
        bookId: event.bookId,
        progress: event.progress,
        chapter: event.chapter,
        position: event.position,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Utility methods for manual progress notifications
  async notifyCustomProgress(
    userId: number,
    jobId: string,
    progress: number,
    status: 'started' | 'progress' | 'completed' | 'failed',
    message: string,
    data?: any,
    error?: string,
  ) {
    await this.progressGateway.notifyProgress({
      jobId,
      userId,
      progress,
      status,
      message,
      data,
      error,
    });
  }

  // Get connection statistics
  getConnectionStats() {
    return this.progressGateway.getConnectionStats();
  }

  // Check if user is connected
  isUserConnected(userId: number): boolean {
    return this.progressGateway.isUserConnected(userId);
  }

  // Get user's socket count (for multi-device support)
  getUserSocketCount(userId: number): number {
    return this.progressGateway.getUserSocketCount(userId);
  }
}
