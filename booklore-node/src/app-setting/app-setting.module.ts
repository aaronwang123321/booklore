import { Module } from '@nestjs/common';
import { AppSettingController } from './app-setting.controller';
import { AppSettingService } from './app-setting.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [AppSettingController],
  providers: [AppSettingService],
  exports: [AppSettingService],
})
export class AppSettingModule {}
