import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  FileTransaction,
  FileOperation,
  FileTransactionType,
  FileTransactionStatus,
  FileOperationType,
  FileOperationStatus,
} from '../interfaces/file-management.interface';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileTransactionService {
  private readonly logger = new Logger(FileTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new file transaction
   */
  async createTransaction(
    userId: number,
    type: FileTransactionType,
    operations: Omit<FileOperation, 'id' | 'status'>[],
  ): Promise<FileTransaction> {
    const transactionId = uuidv4();

    const transaction: FileTransaction = {
      id: transactionId,
      userId,
      type,
      status: FileTransactionStatus.PENDING,
      operations: operations.map(op => ({
        ...op,
        id: uuidv4(),
        status: FileOperationStatus.PENDING,
      })),
      createdAt: new Date(),
    };

    // Store transaction in database
    await this.prisma.fileTransaction.create({
      data: {
        id: transaction.id,
        userId: transaction.userId,
        type: transaction.type,
        status: transaction.status,
        operations: transaction.operations as any,
        createdAt: transaction.createdAt,
      },
    });

    this.logger.log(`Created transaction ${transactionId} with ${operations.length} operations`);
    return transaction;
  }

  /**
   * Execute a file transaction
   */
  async executeTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = await this.getTransaction(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (transaction.status !== FileTransactionStatus.PENDING) {
        throw new Error(`Transaction ${transactionId} is not in pending status`);
      }

      // Update transaction status to in progress
      await this.updateTransactionStatus(transactionId, FileTransactionStatus.IN_PROGRESS);

      // Execute operations in order
      for (const operation of transaction.operations) {
        try {
          await this.executeOperation(transactionId, operation);
        } catch (error) {
          this.logger.error(`Operation ${operation.id} failed: ${error.message}`);

          // Mark operation as failed
          await this.updateOperationStatus(
            transactionId,
            operation.id,
            FileOperationStatus.FAILED,
            error.message,
          );

          // Rollback all completed operations
          await this.rollbackTransaction(transactionId);
          throw error;
        }
      }

      // Mark transaction as completed
      await this.updateTransactionStatus(
        transactionId,
        FileTransactionStatus.COMPLETED,
        new Date(),
      );
      this.logger.log(`Transaction ${transactionId} completed successfully`);
    } catch (error) {
      this.logger.error(`Transaction ${transactionId} failed: ${error.message}`);
      await this.updateTransactionStatus(
        transactionId,
        FileTransactionStatus.FAILED,
        undefined,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Execute a single file operation
   */
  private async executeOperation(transactionId: string, operation: FileOperation): Promise<void> {
    this.logger.debug(`Executing operation ${operation.id}: ${operation.type}`);

    // Update operation status to in progress
    await this.updateOperationStatus(transactionId, operation.id, FileOperationStatus.IN_PROGRESS);

    try {
      switch (operation.type) {
        case FileOperationType.CREATE_BACKUP:
          await this.createBackup(operation);
          break;
        case FileOperationType.MOVE_FILE:
          await this.moveFile(operation);
          break;
        case FileOperationType.UPDATE_DATABASE:
          await this.updateDatabase(operation);
          break;
        case FileOperationType.VERIFY_INTEGRITY:
          await this.verifyIntegrity(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      // Mark operation as completed
      await this.updateOperationStatus(transactionId, operation.id, FileOperationStatus.COMPLETED);
    } catch (error) {
      await this.updateOperationStatus(
        transactionId,
        operation.id,
        FileOperationStatus.FAILED,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Create backup of the file before moving
   */
  private async createBackup(operation: FileOperation): Promise<void> {
    const backupPath = `${operation.sourcePath}.backup.${Date.now()}`;

    try {
      await fs.copyFile(operation.sourcePath, backupPath);

      // Store backup path in rollback data
      operation.rollbackData = { backupPath };

      this.logger.debug(`Created backup: ${backupPath}`);
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Move file from source to target path
   */
  private async moveFile(operation: FileOperation): Promise<void> {
    try {
      // Ensure target directory exists
      const targetDir = path.dirname(operation.targetPath);
      await fs.mkdir(targetDir, { recursive: true });

      // Move the file
      await fs.rename(operation.sourcePath, operation.targetPath);

      // Store original path for rollback
      operation.rollbackData = { originalPath: operation.sourcePath };

      this.logger.debug(`Moved file: ${operation.sourcePath} -> ${operation.targetPath}`);
    } catch (error) {
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  /**
   * Update database records
   */
  private async updateDatabase(operation: FileOperation): Promise<void> {
    try {
      // Get current book data for rollback
      const currentBook = await this.prisma.book.findUnique({
        where: { id: operation.bookId },
      });

      if (!currentBook) {
        throw new Error(`Book ${operation.bookId} not found`);
      }

      // Store current data for rollback
      operation.rollbackData = {
        filePath: currentBook.filePath,
        libraryId: currentBook.libraryId,
        shelfId: currentBook.shelfId,
      };

      // Parse target library and shelf from target path
      const { libraryId, shelfId } = this.parseTargetPath(operation.targetPath);

      // Update book record
      await this.prisma.book.update({
        where: { id: operation.bookId },
        data: {
          filePath: operation.targetPath,
          libraryId,
          shelfId,
          updatedAt: new Date(),
        },
      });

      this.logger.debug(`Updated database for book ${operation.bookId}`);
    } catch (error) {
      throw new Error(`Failed to update database: ${error.message}`);
    }
  }

  /**
   * Verify file integrity after move
   */
  private async verifyIntegrity(operation: FileOperation): Promise<void> {
    try {
      // Check if file exists at target location
      const stats = await fs.stat(operation.targetPath);

      if (!stats.isFile()) {
        throw new Error('Target is not a file');
      }

      // Additional integrity checks could be added here
      // such as checksum verification, file size validation, etc.

      this.logger.debug(`Verified integrity of ${operation.targetPath}`);
    } catch (error) {
      throw new Error(`File integrity verification failed: ${error.message}`);
    }
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = await this.getTransaction(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      this.logger.log(`Starting rollback for transaction ${transactionId}`);

      // Update transaction status
      await this.updateTransactionStatus(transactionId, FileTransactionStatus.IN_PROGRESS);

      // Rollback operations in reverse order
      const completedOperations = transaction.operations
        .filter(op => op.status === FileOperationStatus.COMPLETED)
        .reverse();

      for (const operation of completedOperations) {
        try {
          await this.rollbackOperation(transactionId, operation);
        } catch (error) {
          this.logger.error(`Failed to rollback operation ${operation.id}: ${error.message}`);
          // Continue with other rollbacks even if one fails
        }
      }

      // Mark transaction as rolled back
      await this.updateTransactionStatus(
        transactionId,
        FileTransactionStatus.ROLLED_BACK,
        undefined,
        undefined,
        new Date(),
      );
      this.logger.log(`Transaction ${transactionId} rolled back successfully`);
    } catch (error) {
      this.logger.error(`Failed to rollback transaction ${transactionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rollback a single operation
   */
  private async rollbackOperation(transactionId: string, operation: FileOperation): Promise<void> {
    this.logger.debug(`Rolling back operation ${operation.id}: ${operation.type}`);

    try {
      switch (operation.type) {
        case FileOperationType.UPDATE_DATABASE:
          await this.rollbackDatabaseUpdate(operation);
          break;
        case FileOperationType.MOVE_FILE:
          await this.rollbackFileMove(operation);
          break;
        case FileOperationType.CREATE_BACKUP:
          await this.rollbackBackup(operation);
          break;
        case FileOperationType.VERIFY_INTEGRITY:
          // No rollback needed for verification
          break;
      }

      await this.updateOperationStatus(
        transactionId,
        operation.id,
        FileOperationStatus.ROLLED_BACK,
      );
    } catch (error) {
      this.logger.error(`Failed to rollback operation ${operation.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rollback database update
   */
  private async rollbackDatabaseUpdate(operation: FileOperation): Promise<void> {
    if (!operation.rollbackData) {
      throw new Error('No rollback data available for database update');
    }

    await this.prisma.book.update({
      where: { id: operation.bookId },
      data: {
        filePath: operation.rollbackData.filePath,
        libraryId: operation.rollbackData.libraryId,
        shelfId: operation.rollbackData.shelfId,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(`Rolled back database update for book ${operation.bookId}`);
  }

  /**
   * Rollback file move
   */
  private async rollbackFileMove(operation: FileOperation): Promise<void> {
    if (!operation.rollbackData?.originalPath) {
      throw new Error('No original path available for rollback');
    }

    try {
      await fs.rename(operation.targetPath, operation.rollbackData.originalPath);
      this.logger.debug(
        `Rolled back file move: ${operation.targetPath} -> ${operation.rollbackData.originalPath}`,
      );
    } catch (error) {
      // If move fails, try to restore from backup
      if (operation.rollbackData.backupPath) {
        await fs.copyFile(operation.rollbackData.backupPath, operation.rollbackData.originalPath);
        this.logger.debug(
          `Restored from backup: ${operation.rollbackData.backupPath} -> ${operation.rollbackData.originalPath}`,
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Rollback backup creation (cleanup backup file)
   */
  private async rollbackBackup(operation: FileOperation): Promise<void> {
    if (operation.rollbackData?.backupPath) {
      try {
        await fs.unlink(operation.rollbackData.backupPath);
        this.logger.debug(`Cleaned up backup file: ${operation.rollbackData.backupPath}`);
      } catch (error) {
        // Backup cleanup failure is not critical
        this.logger.warn(`Failed to cleanup backup file: ${error.message}`);
      }
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<FileTransaction | null> {
    try {
      const transaction = await this.prisma.fileTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        return null;
      }

      return {
        id: transaction.id,
        userId: transaction.userId,
        type: transaction.type as FileTransactionType,
        status: transaction.status as FileTransactionStatus,
        operations: transaction.operations as unknown as FileOperation[],
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
        rollbackAt: transaction.rollbackAt,
        error: transaction.error,
      };
    } catch (error) {
      this.logger.error(`Error getting transaction: ${error.message}`);
      return null;
    }
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: FileTransactionStatus,
    completedAt?: Date,
    error?: string,
    rollbackAt?: Date,
  ): Promise<void> {
    await this.prisma.fileTransaction.update({
      where: { id: transactionId },
      data: {
        status,
        completedAt,
        error,
        rollbackAt,
      },
    });
  }

  /**
   * Update operation status
   */
  private async updateOperationStatus(
    transactionId: string,
    operationId: string,
    status: FileOperationStatus,
    error?: string,
  ): Promise<void> {
    const transaction = await this.getTransaction(transactionId);
    if (!transaction) return;

    const updatedOperations = transaction.operations.map(op =>
      op.id === operationId ? { ...op, status, error } : op,
    );

    await this.prisma.fileTransaction.update({
      where: { id: transactionId },
      data: {
        operations: updatedOperations as any,
      },
    });
  }

  /**
   * Parse target path to extract library and shelf IDs
   */
  private parseTargetPath(targetPath: string): { libraryId: number; shelfId?: number } {
    // This is a simplified implementation
    // In a real system, you would have a more sophisticated path parsing logic
    const pathParts = targetPath.split('/');

    // Assuming path structure: /libraries/{libraryId}/shelves/{shelfId}/filename
    const libraryIndex = pathParts.indexOf('libraries');
    const shelfIndex = pathParts.indexOf('shelves');

    if (libraryIndex === -1 || libraryIndex + 1 >= pathParts.length) {
      throw new Error('Invalid target path: library ID not found');
    }

    const libraryId = parseInt(pathParts[libraryIndex + 1]);
    let shelfId: number | undefined;

    if (shelfIndex !== -1 && shelfIndex + 1 < pathParts.length) {
      shelfId = parseInt(pathParts[shelfIndex + 1]);
    }

    return { libraryId, shelfId };
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    userId?: number,
    status?: FileTransactionStatus,
    type?: FileTransactionType,
    startDate?: Date,
    endDate?: Date,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    transactions: FileTransaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: any = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.fileTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fileTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(t => ({
        id: t.id,
        userId: t.userId,
        type: t.type as FileTransactionType,
        status: t.status as FileTransactionStatus,
        operations: t.operations as unknown as FileOperation[],
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        rollbackAt: t.rollbackAt,
        error: t.error,
      })),
      total,
      page,
      limit,
    };
  }
}
