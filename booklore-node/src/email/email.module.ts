import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './services/email.service';
import { EmailQueueService } from './services/email-queue.service';
import { EmailController } from './controllers/email.controller';
import { EmailProviderService } from './services/email-provider.service';
import { EmailRecipientService } from './services/email-recipient.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [ConfigModule, SharedModule],
  controllers: [EmailController],
  providers: [EmailService, EmailQueueService, EmailProviderService, EmailRecipientService],
  exports: [EmailService, EmailQueueService],
})
export class EmailModule {}
