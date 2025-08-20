import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { FilePermissionCheck } from '../interfaces/file-management.interface';
import { Role } from '@prisma/client';

@Injectable()
export class FilePermissionService {
  private readonly logger = new Logger(FilePermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user has permission to move a file from source to target library
   */
  async checkMovePermission(
    userId: number,
    bookId: number,
    sourceLibraryId: number,
    targetLibraryId: number,
  ): Promise<FilePermissionCheck> {
    try {
      // Get user information
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'User not found',
        };
      }

      // Admin users have all permissions
      if (user.role === Role.ADMIN) {
        return {
          canRead: true,
          canWrite: true,
          canMove: true,
          canDelete: true,
        };
      }

      // Check source library permissions
      const sourcePermissions = await this.checkLibraryPermissions(userId, sourceLibraryId);
      if (!sourcePermissions.canRead) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'No read access to source library',
        };
      }

      // Check target library permissions
      const targetPermissions = await this.checkLibraryPermissions(userId, targetLibraryId);
      if (!targetPermissions.canWrite) {
        return {
          canRead: sourcePermissions.canRead,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'No write access to target library',
        };
      }

      // Check if book exists and user has access
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        include: { library: true },
      });

      if (!book) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'Book not found',
        };
      }

      if (book.libraryId !== sourceLibraryId) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'Book is not in the specified source library',
        };
      }

      return {
        canRead: sourcePermissions.canRead,
        canWrite: targetPermissions.canWrite,
        canMove: sourcePermissions.canWrite && targetPermissions.canWrite,
        canDelete: sourcePermissions.canWrite,
      };
    } catch (error) {
      this.logger.error(`Error checking move permission: ${error.message}`);
      return {
        canRead: false,
        canWrite: false,
        canMove: false,
        canDelete: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check user permissions for a specific library
   */
  async checkLibraryPermissions(userId: number, libraryId: number): Promise<FilePermissionCheck> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'User not found',
        };
      }

      // Admin users have all permissions
      if (user.role === Role.ADMIN) {
        return {
          canRead: true,
          canWrite: true,
          canMove: true,
          canDelete: true,
        };
      }

      const library = await this.prisma.library.findUnique({
        where: { id: libraryId },
        include: {
          members: {
            where: { userId },
          },
        },
      });

      if (!library) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'Library not found',
        };
      }

      // Check if user is the library owner
      if (library.ownerId === userId) {
        return {
          canRead: true,
          canWrite: true,
          canMove: true,
          canDelete: true,
        };
      }

      // Check if user is a member of the library
      const membership = library.members[0];
      if (!membership) {
        // Check if library is public for read access
        if (library.isPublic) {
          return {
            canRead: true,
            canWrite: false,
            canMove: false,
            canDelete: false,
          };
        }

        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'No access to library',
        };
      }

      // Determine permissions based on membership role
      switch (membership.role) {
        case 'ADMIN':
          return {
            canRead: true,
            canWrite: true,
            canMove: true,
            canDelete: true,
          };
        case 'EDITOR':
          return {
            canRead: true,
            canWrite: true,
            canMove: true,
            canDelete: false,
          };
        case 'READER':
          return {
            canRead: true,
            canWrite: false,
            canMove: false,
            canDelete: false,
          };
        default:
          return {
            canRead: false,
            canWrite: false,
            canMove: false,
            canDelete: false,
            reason: 'Unknown role',
          };
      }
    } catch (error) {
      this.logger.error(`Error checking library permissions: ${error.message}`);
      return {
        canRead: false,
        canWrite: false,
        canMove: false,
        canDelete: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check if user can access a specific book
   */
  async checkBookAccess(userId: number, bookId: number): Promise<FilePermissionCheck> {
    try {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        include: { library: true },
      });

      if (!book) {
        return {
          canRead: false,
          canWrite: false,
          canMove: false,
          canDelete: false,
          reason: 'Book not found',
        };
      }

      return await this.checkLibraryPermissions(userId, book.libraryId);
    } catch (error) {
      this.logger.error(`Error checking book access: ${error.message}`);
      return {
        canRead: false,
        canWrite: false,
        canMove: false,
        canDelete: false,
        reason: 'Access check failed',
      };
    }
  }

  /**
   * Validate if a file movement operation is allowed
   */
  async validateFileMovement(
    userId: number,
    bookId: number,
    targetLibraryId: number,
    targetShelfId?: number,
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get book information
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        include: { library: true, shelf: true },
      });

      if (!book) {
        errors.push('Book not found');
        return { isValid: false, errors, warnings };
      }

      // Check if moving to the same library
      if (book.libraryId === targetLibraryId) {
        if (!targetShelfId || book.shelfId === targetShelfId) {
          errors.push('Book is already in the target location');
          return { isValid: false, errors, warnings };
        }
        warnings.push('Moving book within the same library');
      }

      // Check permissions
      const permissions = await this.checkMovePermission(
        userId,
        bookId,
        book.libraryId,
        targetLibraryId,
      );

      if (!permissions.canMove) {
        errors.push(permissions.reason || 'No permission to move file');
        return { isValid: false, errors, warnings };
      }

      // Check target library exists
      const targetLibrary = await this.prisma.library.findUnique({
        where: { id: targetLibraryId },
      });

      if (!targetLibrary) {
        errors.push('Target library not found');
        return { isValid: false, errors, warnings };
      }

      // Check target shelf if specified
      if (targetShelfId) {
        const targetShelf = await this.prisma.shelf.findUnique({
          where: { id: targetShelfId },
        });

        if (!targetShelf) {
          errors.push('Target shelf not found');
          return { isValid: false, errors, warnings };
        }

        if (targetShelf.libraryId !== targetLibraryId) {
          errors.push('Target shelf does not belong to target library');
          return { isValid: false, errors, warnings };
        }
      }

      // Check for potential file conflicts
      const existingBook = await this.prisma.book.findFirst({
        where: {
          libraryId: targetLibraryId,
          fileName: book.fileName,
          id: { not: bookId },
        },
      });

      if (existingBook) {
        warnings.push('A book with the same filename already exists in the target library');
      }

      return { isValid: errors.length === 0, errors, warnings };
    } catch (error) {
      this.logger.error(`Error validating file movement: ${error.message}`);
      errors.push('Validation failed due to system error');
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Check if user has permission to rollback a transaction
   */
  async checkRollbackPermission(userId: number, transactionId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return false;
      }

      // Admin users can rollback any transaction
      if (user.role === Role.ADMIN) {
        return true;
      }

      // Users can only rollback their own transactions
      const transaction = await this.prisma.fileTransaction.findUnique({
        where: { id: transactionId },
      });

      return transaction && transaction.userId === userId;
    } catch (error) {
      this.logger.error(`Error checking rollback permission: ${error.message}`);
      return false;
    }
  }
}
