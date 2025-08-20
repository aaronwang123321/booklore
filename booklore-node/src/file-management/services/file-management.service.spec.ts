import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileManagementService } from './file-management.service';
import { FileMovementService } from './file-movement.service';
import { FilePermissionService } from './file-permission.service';
import { FileTransactionService } from './file-transaction.service';
import { 
  FileMovementStatus, 
  FileTransactionStatus, 
  FileTransactionType 
} from '../interfaces/file-management.interface';

describe('FileManagementService', () => {
  let service: FileManagementService;
  let movementService: FileMovementService;
  let permissionService: FilePermissionService;
  let transactionService: FileTransactionService;

  const mockMovementService = {
    moveFile: vi.fn(),
    bulkMoveFiles: vi.fn(),
    getMovementProgress: vi.fn(),
    getActiveMovements: vi.fn(),
    cancelMovement: vi.fn(),
    getMovementStatistics: vi.fn(),
  };

  const mockPermissionService = {
    validateFileMovement: vi.fn(),
    checkBookAccess: vi.fn(),
    checkRollbackPermission: vi.fn(),
  };

  const mockTransactionService = {
    getTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    getTransactionHistory: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileManagementService,
        {
          provide: FileMovementService,
          useValue: mockMovementService,
        },
        {
          provide: FilePermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: FileTransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    service = module.get<FileManagementService>(FileManagementService);
    movementService = module.get<FileMovementService>(FileMovementService);
    permissionService = module.get<FilePermissionService>(FilePermissionService);
    transactionService = module.get<FileTransactionService>(FileTransactionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('moveFile', () => {
    it('should successfully move a file', async () => {
      const userId = 1;
      const moveFileDto = {
        bookId: 1,
        targetLibraryId: 2,
        targetShelfId: 3,
        reason: 'Test move',
      };

      const mockBook = {
        id: 1,
        libraryId: 1,
        title: 'Test Book',
        filePath: '/old/path/book.epub',
      };

      const expectedResult = {
        success: true,
        bookId: 1,
        oldPath: '/old/path/book.epub',
        newPath: '/new/path/book.epub',
        transactionId: 'test-transaction-id',
      };

      // Mock the getBookWithLibrary method
      vi.spyOn(service as any, 'getBookWithLibrary').mockResolvedValue(mockBook);
      mockMovementService.moveFile.mockResolvedValue(expectedResult);

      const result = await service.moveFile(userId, moveFileDto);

      expect(result).toEqual(expectedResult);
      expect(mockMovementService.moveFile).toHaveBeenCalledWith({
        bookId: moveFileDto.bookId,
        sourceLibraryId: mockBook.libraryId,
        targetLibraryId: moveFileDto.targetLibraryId,
        targetShelfId: moveFileDto.targetShelfId,
        userId,
        reason: moveFileDto.reason,
      });
    });

    it('should return error when book not found', async () => {
      const userId = 1;
      const moveFileDto = {
        bookId: 999,
        targetLibraryId: 2,
      };

      vi.spyOn(service as any, 'getBookWithLibrary').mockResolvedValue(null);

      const result = await service.moveFile(userId, moveFileDto);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Book not found');
      expect(mockMovementService.moveFile).not.toHaveBeenCalled();
    });
  });

  describe('bulkMoveFiles', () => {
    it('should successfully move multiple files', async () => {
      const userId = 1;
      const bulkMoveDto = {
        bookIds: [1, 2, 3],
        targetLibraryId: 2,
        targetShelfId: 3,
        reason: 'Bulk move test',
      };

      const expectedResult = {
        successful: [
          { success: true, bookId: 1, oldPath: '/old/1.epub', newPath: '/new/1.epub' },
          { success: true, bookId: 2, oldPath: '/old/2.epub', newPath: '/new/2.epub' },
          { success: true, bookId: 3, oldPath: '/old/3.epub', newPath: '/new/3.epub' },
        ],
        failed: [],
        transactionId: 'bulk-transaction-id',
      };

      mockMovementService.bulkMoveFiles.mockResolvedValue(expectedResult);

      const result = await service.bulkMoveFiles(userId, bulkMoveDto);

      expect(result).toEqual(expectedResult);
      expect(mockMovementService.bulkMoveFiles).toHaveBeenCalledWith({
        bookIds: bulkMoveDto.bookIds,
        targetLibraryId: bulkMoveDto.targetLibraryId,
        targetShelfId: bulkMoveDto.targetShelfId,
        userId,
        reason: bulkMoveDto.reason,
      });
    });
  });

  describe('validateFileMovement', () => {
    it('should validate file movement successfully', async () => {
      const userId = 1;
      const validateDto = {
        bookId: 1,
        targetLibraryId: 2,
        targetShelfId: 3,
      };

      const expectedValidation = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      mockPermissionService.validateFileMovement.mockResolvedValue(expectedValidation);

      const result = await service.validateFileMovement(userId, validateDto);

      expect(result).toEqual(expectedValidation);
      expect(mockPermissionService.validateFileMovement).toHaveBeenCalledWith(
        userId,
        validateDto.bookId,
        validateDto.targetLibraryId,
        validateDto.targetShelfId
      );
    });

    it('should return validation errors', async () => {
      const userId = 1;
      const validateDto = {
        bookId: 1,
        targetLibraryId: 2,
      };

      const expectedValidation = {
        isValid: false,
        errors: ['Permission denied', 'Target library not accessible'],
        warnings: [],
      };

      mockPermissionService.validateFileMovement.mockResolvedValue(expectedValidation);

      const result = await service.validateFileMovement(userId, validateDto);

      expect(result).toEqual(expectedValidation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('getMovementProgress', () => {
    it('should return movement progress', () => {
      const transactionId = 'test-transaction-id';
      const expectedProgress = {
        transactionId,
        totalFiles: 5,
        processedFiles: 3,
        status: FileMovementStatus.IN_PROGRESS,
        startTime: new Date(),
      };

      mockMovementService.getMovementProgress.mockReturnValue(expectedProgress);

      const result = service.getMovementProgress(transactionId);

      expect(result).toEqual(expectedProgress);
      expect(mockMovementService.getMovementProgress).toHaveBeenCalledWith(transactionId);
    });

    it('should return null for non-existent transaction', () => {
      const transactionId = 'non-existent-id';

      mockMovementService.getMovementProgress.mockReturnValue(null);

      const result = service.getMovementProgress(transactionId);

      expect(result).toBeNull();
    });
  });

  describe('rollbackTransaction', () => {
    it('should successfully rollback transaction', async () => {
      const transactionId = 'test-transaction-id';
      const userId = 1;
      const reason = 'Test rollback';

      mockPermissionService.checkRollbackPermission.mockResolvedValue(true);
      mockTransactionService.rollbackTransaction.mockResolvedValue(undefined);

      await service.rollbackTransaction(transactionId, userId, reason);

      expect(mockPermissionService.checkRollbackPermission).toHaveBeenCalledWith(userId, transactionId);
      expect(mockTransactionService.rollbackTransaction).toHaveBeenCalledWith(transactionId);
    });

    it('should throw error when permission denied', async () => {
      const transactionId = 'test-transaction-id';
      const userId = 1;

      mockPermissionService.checkRollbackPermission.mockResolvedValue(false);

      await expect(
        service.rollbackTransaction(transactionId, userId)
      ).rejects.toThrow('Permission denied to rollback transaction');

      expect(mockTransactionService.rollbackTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history', async () => {
      const query = {
        userId: 1,
        status: 'completed',
        page: 1,
        limit: 20,
      };

      const expectedHistory = {
        transactions: [
          {
            id: 'transaction-1',
            userId: 1,
            type: FileTransactionType.SINGLE_MOVE,
            status: FileTransactionStatus.COMPLETED,
            operations: [],
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      mockTransactionService.getTransactionHistory.mockResolvedValue(expectedHistory);

      const result = await service.getTransactionHistory(query);

      expect(result).toEqual(expectedHistory);
      expect(mockTransactionService.getTransactionHistory).toHaveBeenCalledWith(
        query.userId,
        query.status,
        undefined, // type
        undefined, // startDate
        undefined, // endDate
        query.page,
        query.limit
      );
    });
  });

  describe('getMovementStatistics', () => {
    it('should return movement statistics', async () => {
      const userId = 1;
      const expectedStats = {
        totalMovements: 10,
        successfulMovements: 8,
        failedMovements: 2,
        activeMovements: 1,
        averageMovementTime: 5000,
      };

      mockMovementService.getMovementStatistics.mockResolvedValue(expectedStats);

      const result = await service.getMovementStatistics(userId);

      expect(result).toEqual(expectedStats);
      expect(mockMovementService.getMovementStatistics).toHaveBeenCalledWith(userId);
    });
  });

  describe('cancelMovement', () => {
    it('should successfully cancel movement', async () => {
      const transactionId = 'test-transaction-id';
      const userId = 1;

      mockMovementService.cancelMovement.mockResolvedValue(true);

      const result = await service.cancelMovement(transactionId, userId);

      expect(result).toBe(true);
      expect(mockMovementService.cancelMovement).toHaveBeenCalledWith(transactionId, userId);
    });

    it('should return false when cancellation fails', async () => {
      const transactionId = 'test-transaction-id';
      const userId = 1;

      mockMovementService.cancelMovement.mockResolvedValue(false);

      const result = await service.cancelMovement(transactionId, userId);

      expect(result).toBe(false);
    });
  });
});