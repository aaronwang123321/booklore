import { Module } from '@nestjs/common';
import { FileManagementService } from './services/file-management.service';
import { FileMovementService } from './services/file-movement.service';
import { FilePermissionService } from './services/file-permission.service';
import { FileTransactionService } from './services/file-transaction.service';
import { FileManagementController } from './controllers/file-management.controller';
import { SharedModule } from '../shared/shared.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [SharedModule, WebsocketModule],
  controllers: [FileManagementController],
  providers: [
    FileManagementService,
    FileMovementService,
    FilePermissionService,
    FileTransactionService,
  ],
  exports: [
    FileManagementService,
    FileMovementService,
    FilePermissionService,
    FileTransactionService,
  ],
})
export class FileManagementModule {}
