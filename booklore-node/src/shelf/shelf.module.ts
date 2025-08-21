import { Module } from '@nestjs/common';
import { ShelfController } from './shelf.controller';
import { ShelfService } from './shelf.service';
import { DatabaseModule } from '../shared/database/database.module';
import { LibraryModule } from '../library/library.module';

@Module({
  imports: [DatabaseModule, LibraryModule],
  controllers: [ShelfController],
  providers: [ShelfService],
  exports: [ShelfService],
})
export class ShelfModule {}
