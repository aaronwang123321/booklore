import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { FilePermissionService } from './file-permission.service';
import { FileTransactionService } from './file-transaction.service';
import { ProgressGateway } from '../../websocket/gateways/progress.gateway';
import {
  FileMovementRequest,
  FileMovementResult,
  BulkFileMovementRequest,
  BulkFileMovementResult,
  FileMovementProgress,
  FileMovementStatus,
  FileTransactionType,
  FileOperationType,
  FileOperation,
} from '../interfaces/file-management.interface';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileMovementService {
  private readonly logger = new Logger(FileMovementService.name);
  private readonly activeMovements = new Map<string, FileMovementProgress>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: FilePermissionService,
    private readonly transactionService: FileTransactionService,
    private readonly progressGateway: ProgressGateway,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Move a single file between libraries
   */
  async moveFile(request: FileMovementRequest): Promise<FileMovementResult> {
    try {
      this.logger.log(`Starting file move for book ${request.bookId}`);

      // Validate permissions
      const permissions = await this.permissionService.checkMovePermission(
        request.userId,
        request.bookId,
        request.sourceLibraryId,
        request.targetLibraryId,
      );

      if (!permissions.canMove) {
        return {
          success: false,
          bookId: request.bookId,
          oldPath: '',
          newPath: '',
          error: permissions.reason || 'Permission denied',
        };
      }

      // Validate the movement
      const validation = await this.permissionService.validateFileMovement(
        request.userId,
        request.bookId,
        request.targetLibraryId,
        request.targetShelfId,
      );

      if (!validation.isValid) {
        return {
          success: false,
          bookId: request.bookId,
          oldPath: '',
          newPath: '',
          error: validation.errors.join(', '),
        };
      }

      // Get book information
      const book = await this.prisma.book.findUnique({
        where: { id: request.bookId },
        include: { library: true },
      });

      if (!book) {
        return {
          success: false,
          bookId: request.bookId,
          oldPath: '',
          newPath: '',
          error: 'Book not found',
        };
      }

      // Generate target path
      const targetPath = await this.generateTargetPath(
        request.targetLibraryId,
        request.targetShelfId,
        book.fileName,
      );

      // Create file operations
      const operations: Omit<FileOperation, 'id' | 'status'>[] = [
        {
          type: FileOperationType.CREATE_BACKUP,
          bookId: request.bookId,
          sourcePath: book.filePath,
          targetPath: `${book.filePath}.backup`,
        },
        {
          type: FileOperationType.MOVE_FILE,
          bookId: request.bookId,
          sourcePath: book.filePath,
          targetPath,
        },
        {
          type: FileOperationType.UPDATE_DATABASE,
          bookId: request.bookId,
          sourcePath: book.filePath,
          targetPath,
        },
        {
          type: FileOperationType.VERIFY_INTEGRITY,
          bookId: request.bookId,
          sourcePath: book.filePath,
          targetPath,
        },
      ];

      // Create and execute transaction
      const transaction = await this.transactionService.createTransaction(
        request.userId,
        FileTransactionType.SINGLE_MOVE,
        operations,
      );

      // Start progress tracking
      this.startProgressTracking(transaction.id, 1, `Moving ${book.title}`);

      try {
        await this.transactionService.executeTransaction(transaction.id);

        this.updateProgress(transaction.id, 1, 1, FileMovementStatus.COMPLETED);

        return {
          success: true,
          bookId: request.bookId,
          oldPath: book.filePath,
          newPath: targetPath,
          transactionId: transaction.id,
        };
      } catch (error) {
        this.updateProgress(transaction.id, 1, 0, FileMovementStatus.FAILED);
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error moving file: ${error.message}`);
      return {
        success: false,
        bookId: request.bookId,
        oldPath: '',
        newPath: '',
        error: error.message,
      };
    }
  }

  /**
   * Move multiple files in bulk
   */
  async bulkMoveFiles(request: BulkFileMovementRequest): Promise<BulkFileMovementResult> {
    this.logger.log(`Starting bulk move for ${request.bookIds.length} books`);

    const successful: FileMovementResult[] = [];
    const failed: FileMovementResult[] = [];

    // Create operations for all books
    const allOperations: Omit<FileOperation, 'id' | 'status'>[] = [];
    const bookPaths: { bookId: number; oldPath: string; newPath: string }[] = [];

    try {
      // Validate and prepare operations for each book
      for (const bookId of request.bookIds) {
        const book = await this.prisma.book.findUnique({
          where: { id: bookId },
          include: { library: true },
        });

        if (!book) {
          failed.push({
            success: false,
            bookId,
            oldPath: '',
            newPath: '',
            error: 'Book not found',
          });
          continue;
        }

        // Check permissions
        const permissions = await this.permissionService.checkMovePermission(
          request.userId,
          bookId,
          book.libraryId,
          request.targetLibraryId,
        );

        if (!permissions.canMove) {
          failed.push({
            success: false,
            bookId,
            oldPath: book.filePath,
            newPath: '',
            error: permissions.reason || 'Permission denied',
          });
          continue;
        }

        // Generate target path
        const targetPath = await this.generateTargetPath(
          request.targetLibraryId,
          request.targetShelfId,
          book.fileName,
        );

        bookPaths.push({
          bookId,
          oldPath: book.filePath,
          newPath: targetPath,
        });

        // Add operations for this book
        allOperations.push(
          {
            type: FileOperationType.CREATE_BACKUP,
            bookId,
            sourcePath: book.filePath,
            targetPath: `${book.filePath}.backup`,
          },
          {
            type: FileOperationType.MOVE_FILE,
            bookId,
            sourcePath: book.filePath,
            targetPath,
          },
          {
            type: FileOperationType.UPDATE_DATABASE,
            bookId,
            sourcePath: book.filePath,
            targetPath,
          },
          {
            type: FileOperationType.VERIFY_INTEGRITY,
            bookId,
            sourcePath: book.filePath,
            targetPath,
          },
        );
      }

      if (allOperations.length === 0) {
        return {
          successful,
          failed,
          transactionId: '',
        };
      }

      // Create bulk transaction
      const transaction = await this.transactionService.createTransaction(
        request.userId,
        FileTransactionType.BULK_MOVE,
        allOperations,
      );

      // Start progress tracking
      this.startProgressTracking(
        transaction.id,
        bookPaths.length,
        `Bulk moving ${bookPaths.length} books`,
      );

      try {
        await this.transactionService.executeTransaction(transaction.id);

        // All operations succeeded
        for (const bookPath of bookPaths) {
          successful.push({
            success: true,
            bookId: bookPath.bookId,
            oldPath: bookPath.oldPath,
            newPath: bookPath.newPath,
            transactionId: transaction.id,
          });
        }

        this.updateProgress(
          transaction.id,
          bookPaths.length,
          bookPaths.length,
          FileMovementStatus.COMPLETED,
        );
      } catch (error) {
        // Transaction failed, all books failed
        for (const bookPath of bookPaths) {
          failed.push({
            success: false,
            bookId: bookPath.bookId,
            oldPath: bookPath.oldPath,
            newPath: bookPath.newPath,
            error: error.message,
          });
        }

        this.updateProgress(transaction.id, bookPaths.length, 0, FileMovementStatus.FAILED);
      }

      return {
        successful,
        failed,
        transactionId: transaction.id,
      };
    } catch (error) {
      this.logger.error(`Error in bulk move: ${error.message}`);

      // Mark all remaining books as failed
      for (const bookId of request.bookIds) {
        if (!successful.find(s => s.bookId === bookId) && !failed.find(f => f.bookId === bookId)) {
          failed.push({
            success: false,
            bookId,
            oldPath: '',
            newPath: '',
            error: error.message,
          });
        }
      }

      return {
        successful,
        failed,
        transactionId: '',
      };
    }
  }

  /**
   * Get movement progress
   */
  getMovementProgress(transactionId: string): FileMovementProgress | null {
    return this.activeMovements.get(transactionId) || null;
  }

  /**
   * Cancel a file movement operation
   */
  async cancelMovement(transactionId: string, userId: number): Promise<boolean> {
    try {
      // Check if user has permission to cancel
      const hasPermission = await this.permissionService.checkRollbackPermission(
        userId,
        transactionId,
      );
      if (!hasPermission) {
        return false;
      }

      const progress = this.activeMovements.get(transactionId);
      if (!progress) {
        return false;
      }

      if (progress.status === FileMovementStatus.COMPLETED) {
        return false; // Cannot cancel completed operations
      }

      // Update progress status
      this.updateProgress(
        transactionId,
        progress.totalFiles,
        progress.processedFiles,
        FileMovementStatus.CANCELLED,
      );

      // Rollback the transaction
      await this.transactionService.rollbackTransaction(transactionId);

      return true;
    } catch (error) {
      this.logger.error(`Error cancelling movement: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate target path for a file
   */
  private async generateTargetPath(
    targetLibraryId: number,
    targetShelfId: number | undefined,
    fileName: string,
  ): Promise<string> {
    // Get library base path
    const library = await this.prisma.library.findUnique({
      where: { id: targetLibraryId },
    });

    if (!library) {
      throw new Error('Target library not found');
    }

    // Generate base path for the library
    const libraryBasePath =
      this.configService.get(`LIBRARY_${targetLibraryId}_PATH`) ||
      path.join(
        this.configService.get('STORAGE_PATH', '/storage'),
        'libraries',
        targetLibraryId.toString(),
      );

    let targetPath = libraryBasePath;

    // Add shelf path if specified
    if (targetShelfId) {
      const shelf = await this.prisma.shelf.findUnique({
        where: { id: targetShelfId },
      });

      if (shelf) {
        targetPath = path.join(targetPath, 'shelves', targetShelfId.toString());
      }
    }

    // Add filename
    targetPath = path.join(targetPath, fileName);

    // Ensure unique filename if file already exists
    let counter = 1;
    let finalPath = targetPath;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    while (await this.fileExists(finalPath)) {
      finalPath = path.join(path.dirname(targetPath), `${baseName}_${counter}${ext}`);
      counter++;
    }

    return finalPath;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start progress tracking for a movement operation
   */
  private startProgressTracking(
    transactionId: string,
    totalFiles: number,
    description: string,
  ): void {
    const progress: FileMovementProgress = {
      transactionId,
      totalFiles,
      processedFiles: 0,
      currentFile: description,
      status: FileMovementStatus.IN_PROGRESS,
      startTime: new Date(),
    };

    this.activeMovements.set(transactionId, progress);
    this.notifyProgress(progress);
  }

  /**
   * Update movement progress
   */
  private updateProgress(
    transactionId: string,
    totalFiles: number,
    processedFiles: number,
    status: FileMovementStatus,
    currentFile?: string,
  ): void {
    const progress = this.activeMovements.get(transactionId);
    if (!progress) return;

    progress.totalFiles = totalFiles;
    progress.processedFiles = processedFiles;
    progress.status = status;
    if (currentFile) progress.currentFile = currentFile;

    // Calculate estimated completion
    if (status === FileMovementStatus.IN_PROGRESS && processedFiles > 0) {
      const elapsed = Date.now() - progress.startTime.getTime();
      const avgTimePerFile = elapsed / processedFiles;
      const remainingFiles = totalFiles - processedFiles;
      progress.estimatedCompletion = new Date(Date.now() + avgTimePerFile * remainingFiles);
    }

    this.activeMovements.set(transactionId, progress);
    this.notifyProgress(progress);

    // Clean up completed/failed operations after 5 minutes
    if (
      status === FileMovementStatus.COMPLETED ||
      status === FileMovementStatus.FAILED ||
      status === FileMovementStatus.CANCELLED
    ) {
      setTimeout(
        () => {
          this.activeMovements.delete(transactionId);
        },
        5 * 60 * 1000,
      );
    }
  }

  /**
   * Notify clients about progress updates
   */
  private notifyProgress(progress: FileMovementProgress): void {
    this.progressGateway.notifyFileMovementProgress(progress);
  }

  /**
   * Get all active movements
   */
  getActiveMovements(): FileMovementProgress[] {
    return Array.from(this.activeMovements.values());
  }

  /**
   * Get movement statistics
   */
  async getMovementStatistics(userId?: number): Promise<{
    totalMovements: number;
    successfulMovements: number;
    failedMovements: number;
    activeMovements: number;
    averageMovementTime: number;
  }> {
    const where: any = {};
    if (userId) where.userId = userId;

    const [total, successful, failed] = await Promise.all([
      this.prisma.fileTransaction.count({ where }),
      this.prisma.fileTransaction.count({
        where: { ...where, status: 'COMPLETED' },
      }),
      this.prisma.fileTransaction.count({
        where: { ...where, status: 'FAILED' },
      }),
    ]);

    const activeMovements = this.activeMovements.size;

    // Calculate average movement time for completed transactions
    const completedTransactions = await this.prisma.fileTransaction.findMany({
      where: { ...where, status: 'COMPLETED', completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    });

    let averageMovementTime = 0;
    if (completedTransactions.length > 0) {
      const totalTime = completedTransactions.reduce((sum, t) => {
        return sum + (t.completedAt!.getTime() - t.createdAt.getTime());
      }, 0);
      averageMovementTime = totalTime / completedTransactions.length;
    }

    return {
      totalMovements: total,
      successfulMovements: successful,
      failedMovements: failed,
      activeMovements,
      averageMovementTime,
    };
  }
}
