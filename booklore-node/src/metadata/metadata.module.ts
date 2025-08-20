import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetadataService } from './services/metadata.service';
import { MetadataController } from './controllers/metadata.controller';
import { GoogleBooksProvider } from './providers/google-books.provider';
import { GoodreadsProvider } from './providers/goodreads.provider';
import { AmazonProvider } from './providers/amazon.provider';
import { MetadataMatcherService } from './services/metadata-matcher.service';
import { MetadataHistoryService } from './services/metadata-history.service';
import { MetadataTemplateService } from './services/metadata-template.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    SharedModule,
  ],
  controllers: [MetadataController],
  providers: [
    MetadataService,
    GoogleBooksProvider,
    GoodreadsProvider,
    AmazonProvider,
    MetadataMatcherService,
    MetadataHistoryService,
    MetadataTemplateService,
  ],
  exports: [
    MetadataService,
    MetadataMatcherService,
    MetadataHistoryService,
    MetadataTemplateService,
  ],
})
export class MetadataModule {}
