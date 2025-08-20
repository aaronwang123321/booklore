import { Module } from '@nestjs/common';
import { PathController } from './path.controller';
import { PathService } from './path.service';

@Module({
  controllers: [PathController],
  providers: [PathService],
  exports: [PathService],
})
export class PathModule {}
