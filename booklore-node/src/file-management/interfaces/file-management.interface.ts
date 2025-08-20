export interface FileMovementRequest {
  bookId: number;
  sourceLibraryId: number;
  targetLibraryId: number;
  targetShelfId?: number;
  userId: number;
  reason?: string;
}

export interface FileMovementResult {
  success: boolean;
  bookId: number;
  oldPath: string;
  newPath: string;
  transactionId?: string;
  error?: string;
}

export interface BulkFileMovementRequest {
  bookIds: number[];
  targetLibraryId: number;
  targetShelfId?: number;
  userId: number;
  reason?: string;
}

export interface BulkFileMovementResult {
  successful: FileMovementResult[];
  failed: FileMovementResult[];
  transactionId: string;
}

export interface FileMovementProgress {
  transactionId: string;
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  status: FileMovementStatus;
  startTime: Date;
  estimatedCompletion?: Date;
}

export interface FileTransaction {
  id: string;
  userId: number;
  type: FileTransactionType;
  status: FileTransactionStatus;
  operations: FileOperation[];
  createdAt: Date;
  completedAt?: Date;
  rollbackAt?: Date;
  error?: string;
}

export interface FileOperation {
  id: string;
  type: FileOperationType;
  bookId: number;
  sourcePath: string;
  targetPath: string;
  status: FileOperationStatus;
  error?: string;
  rollbackData?: any;
}

export interface FilePermissionCheck {
  canRead: boolean;
  canWrite: boolean;
  canMove: boolean;
  canDelete: boolean;
  reason?: string;
}

export interface FileMovementValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export enum FileMovementStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ROLLING_BACK = 'rolling_back',
  ROLLED_BACK = 'rolled_back',
}

export enum FileTransactionType {
  SINGLE_MOVE = 'single_move',
  BULK_MOVE = 'bulk_move',
  LIBRARY_TRANSFER = 'library_transfer',
  SHELF_REORGANIZATION = 'shelf_reorganization',
}

export enum FileTransactionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export enum FileOperationType {
  MOVE_FILE = 'move_file',
  UPDATE_DATABASE = 'update_database',
  CREATE_BACKUP = 'create_backup',
  VERIFY_INTEGRITY = 'verify_integrity',
}

export enum FileOperationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}
