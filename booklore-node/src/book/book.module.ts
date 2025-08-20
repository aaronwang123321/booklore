import { Module } from '@nestjs/common';
import { BookService } from './book.service';
import { BookController } from './book.controller';
import { ParserController } from './controllers/parser.controller';
import { CbxReaderController } from './controllers/cbx-reader.controller';
import { FileParserService } from './services/file-parser.service';
import { CbxReaderService } from './services/cbx-reader.service';
import { EpubParser } from './parsers/epub.parser';
import { PdfParser } from './parsers/pdf.parser';
import { CbxParser } from './parsers/cbx.parser';
import { SharedModule } from '../shared/shared.module';
import { LibraryModule } from '../library/library.module';

@Module({
  imports: [SharedModule, LibraryModule],
  controllers: [BookController, ParserController, CbxReaderController],
  providers: [BookService, FileParserService, CbxReaderService, EpubParser, PdfParser, CbxParser],
  exports: [BookService, FileParserService, CbxReaderService],
})
export class BookModule {}
