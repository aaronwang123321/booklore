import { Controller, Post, Get, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FileManagementService } from '../services/file-management.service';
import {
  MoveFileDto,
  BulkMoveFilesDto,
  RollbackTransactionDto,
  ValidateFileMovementDto,
  FilePermissionCheckDto,
  FileTransactionQueryDto,
} from '../dto/file-management.dto';

@ApiTags('File Management')
@Controller('file-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FileManagementController {
  constructor(private readonly fileManagementService: FileManagementService) {}

  @Post('move')
  @ApiOperation({ summary: 'Move a single file between libraries' })
  @ApiResponse({ status: 200, description: 'File moved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or permission denied' })
  @Roles(Role.USER)
  async moveFile(@Body() moveFileDto: MoveFileDto, @CurrentUser() user: any) {
    return await this.fileManagementService.moveFile(user.id, moveFileDto);
  }

  @Post('bulk-move')
  @ApiOperation({ summary: 'Move multiple files in bulk' })
  @ApiResponse({ status: 200, description: 'Bulk move operation initiated' })
  @ApiResponse({ status: 400, description: 'Invalid request or permission denied' })
  @Roles(Role.USER)
  async bulkMoveFiles(@Body() bulkMoveDto: BulkMoveFilesDto, @CurrentUser() user: any) {
    return await this.fileManagementService.bulkMoveFiles(user.id, bulkMoveDto);
  }

  @Post('validate-movement')
  @ApiOperation({ summary: 'Validate if a file movement is allowed' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  @Roles(Role.USER)
  async validateFileMovement(
    @Body() validateDto: ValidateFileMovementDto,
    @CurrentUser() user: any,
  ) {
    return await this.fileManagementService.validateFileMovement(user.id, validateDto);
  }

  @Post('check-permissions')
  @ApiOperation({ summary: 'Check file permissions for a user' })
  @ApiResponse({ status: 200, description: 'Permission check result' })
  @Roles(Role.USER)
  async checkFilePermissions(
    @Body() permissionDto: FilePermissionCheckDto,
    @CurrentUser() user: any,
  ) {
    return await this.fileManagementService.checkFilePermissions(user.id, permissionDto);
  }

  @Get('progress/:transactionId')
  @ApiOperation({ summary: 'Get movement progress for a transaction' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Movement progress' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @Roles(Role.USER)
  async getMovementProgress(@Param('transactionId') transactionId: string) {
    const progress = this.fileManagementService.getMovementProgress(transactionId);
    if (!progress) {
      return { message: 'Transaction not found or completed' };
    }
    return progress;
  }

  @Get('active-movements')
  @ApiOperation({ summary: 'Get all active movement operations' })
  @ApiResponse({ status: 200, description: 'List of active movements' })
  @Roles(Role.USER)
  async getActiveMovements() {
    return {
      activeMovements: this.fileManagementService.getActiveMovements(),
    };
  }

  @Post('cancel/:transactionId')
  @ApiOperation({ summary: 'Cancel a movement operation' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID to cancel' })
  @ApiResponse({ status: 200, description: 'Movement cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel movement' })
  @Roles(Role.USER)
  async cancelMovement(@Param('transactionId') transactionId: string, @CurrentUser() user: any) {
    const success = await this.fileManagementService.cancelMovement(transactionId, user.id);
    return {
      success,
      message: success ? 'Movement cancelled successfully' : 'Cannot cancel movement',
    };
  }

  @Post('rollback')
  @ApiOperation({ summary: 'Rollback a completed transaction' })
  @ApiResponse({ status: 200, description: 'Transaction rolled back successfully' })
  @ApiResponse({ status: 400, description: 'Cannot rollback transaction' })
  @Roles(Role.USER)
  async rollbackTransaction(@Body() rollbackDto: RollbackTransactionDto, @CurrentUser() user: any) {
    try {
      await this.fileManagementService.rollbackTransaction(
        rollbackDto.transactionId,
        user.id,
        rollbackDto.reason,
      );
      return { message: 'Transaction rolled back successfully' };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Get('transactions/:transactionId')
  @ApiOperation({ summary: 'Get transaction details' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @Roles(Role.USER)
  async getTransaction(@Param('transactionId') transactionId: string) {
    const transaction = await this.fileManagementService.getTransaction(transactionId);
    if (!transaction) {
      return { message: 'Transaction not found' };
    }
    return transaction;
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiResponse({ status: 200, description: 'Transaction history' })
  @Roles(Role.USER)
  async getTransactionHistory(@Query() query: FileTransactionQueryDto) {
    return await this.fileManagementService.getTransactionHistory(query);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get file movement statistics' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiResponse({ status: 200, description: 'Movement statistics' })
  @Roles(Role.USER)
  async getMovementStatistics(@Query('userId') userId?: number) {
    return await this.fileManagementService.getMovementStatistics(userId);
  }

  @Get('recommendations/:bookId')
  @ApiOperation({ summary: 'Get movement recommendations for a book' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  @ApiResponse({ status: 200, description: 'Movement recommendations' })
  @Roles(Role.USER)
  async getMovementRecommendations(
    @Param('bookId', ParseIntPipe) bookId: number,
    @CurrentUser() user: any,
  ) {
    return await this.fileManagementService.getMovementRecommendations(user.id, bookId);
  }

  @Post('organize/:libraryId')
  @ApiOperation({ summary: 'Automatically organize files in a library' })
  @ApiParam({ name: 'libraryId', description: 'Library ID' })
  @ApiResponse({ status: 200, description: 'Organization completed' })
  @Roles(Role.USER)
  async organizeFiles(
    @Param('libraryId', ParseIntPipe) libraryId: number,
    @Body() organizationRules: any,
    @CurrentUser() user: any,
  ) {
    return await this.fileManagementService.organizeFiles(user.id, libraryId, organizationRules);
  }

  // Admin endpoints
  @Get('admin/all-transactions')
  @ApiOperation({ summary: 'Get all transactions (admin only)' })
  @ApiResponse({ status: 200, description: 'All transactions' })
  @Roles(Role.ADMIN)
  async getAllTransactions(@Query() query: FileTransactionQueryDto) {
    return await this.fileManagementService.getTransactionHistory(query);
  }

  @Post('admin/force-rollback/:transactionId')
  @ApiOperation({ summary: 'Force rollback any transaction (admin only)' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction force rolled back' })
  @Roles(Role.ADMIN)
  async forceRollbackTransaction(
    @Param('transactionId') transactionId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    try {
      // Admin can rollback any transaction
      const transaction = await this.fileManagementService.getTransaction(transactionId);
      if (!transaction) {
        return { success: false, message: 'Transaction not found' };
      }

      await this.fileManagementService.rollbackTransaction(
        transactionId,
        user.id, // Use admin's ID
        body.reason || 'Admin force rollback',
      );

      return { message: 'Transaction force rolled back successfully' };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Get('admin/statistics')
  @ApiOperation({ summary: 'Get comprehensive movement statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Comprehensive statistics' })
  @Roles(Role.ADMIN)
  async getComprehensiveStatistics() {
    const stats = await this.fileManagementService.getMovementStatistics();
    const activeMovements = this.fileManagementService.getActiveMovements();

    return {
      ...stats,
      activeMovementDetails: activeMovements,
      systemHealth: {
        activeOperations: activeMovements.length,
        systemLoad:
          activeMovements.length > 10 ? 'high' : activeMovements.length > 5 ? 'medium' : 'low',
      },
    };
  }
}
