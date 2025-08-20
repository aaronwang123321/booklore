import { Injectable, Logger } from '@nestjs/common';
import { FileMovementService } from './file-movement.service';
import { FilePermissionService } from './file-permission.service';
import { FileTransactionService } from './file-transaction.service';
import {
  FileMovementRequest,
  FileMovementResult,
  BulkFileMovementRequest,
  BulkFileMovementResult,
  FileMovementProgress,
  FileTransaction,
} from '../interfaces/file-management.interface';
import {
  MoveFileDto,
  BulkMoveFilesDto,
  ValidateFileMovementDto,
  FilePermissionCheckDto,
  FileTransactionQueryDto,
} from '../dto/file-management.dto';

@Injectable()
export class FileManagementService {
  private readonly logger = new Logger(FileManagementService.name);

  constructor(
    private readonly movementService: FileMovementService,
    private readonly permissionService: FilePermissionService,
    private readonly transactionService: FileTransactionService,
  ) {}

  /**
   * Move a single file between libraries
   */
  async moveFile(userId: number, moveFileDto: MoveFileDto): Promise<FileMovementResult> {
    this.logger.log(`User ${userId} requesting to move book ${moveFileDto.bookId}`);

    // Get source library ID from book
    const book = await this.getBookWithLibrary(moveFileDto.bookId);
    if (!book) {
      return {
        success: false,
        bookId: moveFileDto.bookId,
        oldPath: '',
        newPath: '',
        error: 'Book not found',
      };
    }

    const request: FileMovementRequest = {
      bookId: moveFileDto.bookId,
      sourceLibraryId: book.libraryId,
      targetLibraryId: moveFileDto.targetLibraryId,
      targetShelfId: moveFileDto.targetShelfId,
      userId,
      reason: moveFileDto.reason,
    };

    return await this.movementService.moveFile(request);
  }

  /**
   * Move multiple files in bulk
   */
  async bulkMoveFiles(
    userId: number,
    bulkMoveDto: BulkMoveFilesDto,
  ): Promise<BulkFileMovementResult> {
    this.logger.log(`User ${userId} requesting bulk move of ${bulkMoveDto.bookIds.length} books`);

    const request: BulkFileMovementRequest = {
      bookIds: bulkMoveDto.bookIds,
      targetLibraryId: bulkMoveDto.targetLibraryId,
      targetShelfId: bulkMoveDto.targetShelfId,
      userId,
      reason: bulkMoveDto.reason,
    };

    return await this.movementService.bulkMoveFiles(request);
  }

  /**
   * Validate if a file movement is allowed
   */
  async validateFileMovement(userId: number, validateDto: ValidateFileMovementDto) {
    return await this.permissionService.validateFileMovement(
      userId,
      validateDto.bookId,
      validateDto.targetLibraryId,
      validateDto.targetShelfId,
    );
  }

  /**
   * Check file permissions for a user
   */
  async checkFilePermissions(userId: number, permissionDto: FilePermissionCheckDto) {
    return await this.permissionService.checkBookAccess(userId, permissionDto.bookId);
  }

  /**
   * Get movement progress
   */
  getMovementProgress(transactionId: string): FileMovementProgress | null {
    return this.movementService.getMovementProgress(transactionId);
  }

  /**
   * Get all active movements
   */
  getActiveMovements(): FileMovementProgress[] {
    return this.movementService.getActiveMovements();
  }

  /**
   * Cancel a movement operation
   */
  async cancelMovement(transactionId: string, userId: number): Promise<boolean> {
    return await this.movementService.cancelMovement(transactionId, userId);
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transactionId: string, userId: number, reason?: string): Promise<void> {
    // Check permission
    const hasPermission = await this.permissionService.checkRollbackPermission(
      userId,
      transactionId,
    );
    if (!hasPermission) {
      throw new Error('Permission denied to rollback transaction');
    }

    await this.transactionService.rollbackTransaction(transactionId);
    this.logger.log(
      `Transaction ${transactionId} rolled back by user ${userId}. Reason: ${reason || 'No reason provided'}`,
    );
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<FileTransaction | null> {
    return await this.transactionService.getTransaction(transactionId);
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(query: FileTransactionQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return await this.transactionService.getTransactionHistory(
      query.userId,
      query.status as any,
      query.type as any,
      startDate,
      endDate,
      query.page,
      query.limit,
    );
  }

  /**
   * Get movement statistics
   */
  async getMovementStatistics(userId?: number) {
    return await this.movementService.getMovementStatistics(userId);
  }

  /**
   * Get file movement recommendations
   */
  async getMovementRecommendations(userId: number, bookId: number) {
    // Get user's accessible libraries
    const user = await this.getUserWithLibraries(userId);
    if (!user) {
      return { recommendations: [] };
    }

    const book = await this.getBookWithLibrary(bookId);
    if (!book) {
      return { recommendations: [] };
    }

    const recommendations = [];

    // Recommend libraries where user has write access
    for (const library of user.accessibleLibraries) {
      if (library.id === book.libraryId) continue; // Skip current library

      const permissions = await this.permissionService.checkLibraryPermissions(userId, library.id);
      if (permissions.canWrite) {
        // Get shelves in this library
        const shelves = await this.getLibraryShelves(library.id);

        recommendations.push({
          libraryId: library.id,
          libraryName: library.name,
          canMove: permissions.canMove,
          shelves: shelves.map(shelf => ({
            shelfId: shelf.id,
            shelfName: shelf.name,
            bookCount: shelf._count?.books || 0,
          })),
        });
      }
    }

    return { recommendations };
  }

  /**
   * Organize files by moving them to appropriate shelves based on metadata
   */
  async organizeFiles(userId: number, libraryId: number, organizationRules?: any) {
    this.logger.log(`Starting file organization for library ${libraryId}`);

    // Get all books in the library without a shelf
    const unorganizedBooks = await this.getUnorganizedBooks(libraryId);

    if (unorganizedBooks.length === 0) {
      return { message: 'No unorganized books found', organized: 0 };
    }

    const moveOperations = [];

    for (const book of unorganizedBooks) {
      // Determine target shelf based on metadata
      const targetShelfId = await this.determineTargetShelf(book, libraryId, organizationRules);

      if (targetShelfId) {
        moveOperations.push({
          bookId: book.id,
          targetShelfId,
        });
      }
    }

    if (moveOperations.length === 0) {
      return { message: 'No suitable shelves found for organization', organized: 0 };
    }

    // Execute bulk move
    const bulkMoveDto: BulkMoveFilesDto = {
      bookIds: moveOperations.map(op => op.bookId),
      targetLibraryId: libraryId,
      targetShelfId: moveOperations[0].targetShelfId, // Simplified - in reality, you'd need more complex logic
      reason: 'Automatic organization',
    };

    const result = await this.bulkMoveFiles(userId, bulkMoveDto);

    return {
      message: `Organized ${result.successful.length} books`,
      organized: result.successful.length,
      failed: result.failed.length,
      transactionId: result.transactionId,
    };
  }

  /**
   * Helper method to get book with library information
   */
  private async getBookWithLibrary(bookId: number) {
    const { PrismaService } = await import('../../shared/database/prisma.service');
    const prisma = new PrismaService();

    return await prisma.book.findUnique({
      where: { id: bookId },
      include: { library: true },
    });
  }

  /**
   * Helper method to get user with accessible libraries
   */
  private async getUserWithLibraries(userId: number) {
    const { PrismaService } = await import('../../shared/database/prisma.service');
    const prisma = new PrismaService();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedLibraries: true,
        libraryMembers: {
          include: { library: true },
        },
      },
    });

    if (!user) return null;

    // Combine owned libraries and member libraries
    const accessibleLibraries = [
      ...user.ownedLibraries,
      ...user.libraryMembers.map(member => member.library),
    ];

    return {
      ...user,
      accessibleLibraries,
    };
  }

  /**
   * Helper method to get library shelves
   */
  private async getLibraryShelves(libraryId: number) {
    const { PrismaService } = await import('../../shared/database/prisma.service');
    const prisma = new PrismaService();

    return await prisma.shelf.findMany({
      where: { libraryId },
      include: {
        _count: {
          select: { books: true },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Helper method to get unorganized books
   */
  private async getUnorganizedBooks(libraryId: number) {
    const { PrismaService } = await import('../../shared/database/prisma.service');
    const prisma = new PrismaService();

    return await prisma.book.findMany({
      where: {
        libraryId,
        shelfId: null,
      },
      // Note: metadata field doesn't exist in current schema
    });
  }

  /**
   * Helper method to determine target shelf for a book
   */
  private async determineTargetShelf(
    book: any,
    libraryId: number,
    _organizationRules?: any,
  ): Promise<number | null> {
    // This is a simplified implementation
    // In a real system, you would have more sophisticated rules based on:
    // - Book genre
    // - Author
    // - Publication date
    // - File type
    // - Custom user rules

    const shelves = await this.getLibraryShelves(libraryId);

    if (shelves.length === 0) return null;

    // Simple rule: if book has genre metadata, try to match with shelf name
    if (book.metadata?.genres && Array.isArray(book.metadata.genres)) {
      for (const genre of book.metadata.genres) {
        const matchingShelf = shelves.find(shelf =>
          shelf.name.toLowerCase().includes(genre.toLowerCase()),
        );
        if (matchingShelf) return matchingShelf.id;
      }
    }

    // Fallback: use the first available shelf
    return shelves[0]?.id || null;
  }
}
