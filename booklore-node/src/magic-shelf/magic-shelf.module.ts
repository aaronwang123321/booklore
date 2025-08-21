import { Module } from '@nestjs/common';
import { MagicShelfController } from './magic-shelf.controller';
import { MagicShelfService } from './magic-shelf.service';
import { DatabaseModule } from '../shared/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MagicShelfController],
  providers: [MagicShelfService],
  exports: [MagicShelfService],
})
export class MagicShelfModule {}
