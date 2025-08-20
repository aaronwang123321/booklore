import { Module } from '@nestjs/common';
import { OpdsController } from './controllers/opds.controller';
import { OpdsAdminController } from './controllers/opds-admin.controller';
import { OpdsService } from './services/opds.service';
import { OpdsAuthService } from './services/opds-auth.service';
import { OpdsXmlGenerator } from './services/opds-xml-generator.service';
import { SharedModule } from '../shared/shared.module';
import { LibraryModule } from '../library/library.module';

@Module({
  imports: [SharedModule, LibraryModule],
  controllers: [OpdsController, OpdsAdminController],
  providers: [OpdsService, OpdsAuthService, OpdsXmlGenerator],
  exports: [OpdsService, OpdsAuthService],
})
export class OpdsModule {}
