import { Module } from '@nestjs/common';
import { PdfReaderController } from './pdf-reader.controller';
import { PdfReaderService } from './pdf-reader.service';
import { DatabaseModule } from '../shared/database/database.module';
import { PdfParser } from '../book/parsers/pdf.parser';

@Module({
  imports: [DatabaseModule],
  controllers: [PdfReaderController],
  providers: [PdfReaderService, PdfParser],
  exports: [PdfReaderService],
})
export class PdfReaderModule {}
