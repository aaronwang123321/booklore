import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { BookService } from './book.service';
import { CreateBookDto, UpdateBookDto, BookResponseDto } from './dto/book.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Books')
@Controller('books')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Create a new book' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Book created successfully', type: BookResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async create(
    @CurrentUser() user: User,
    @Body() createBookDto: CreateBookDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<BookResponseDto> {
    return this.bookService.create(user.id, createBookDto, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accessible books' })
  @ApiQuery({
    name: 'libraryId',
    required: false,
    type: Number,
    description: 'Filter by library ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Books retrieved successfully',
    type: [BookResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: User,
    @Query('libraryId', new ParseIntPipe({ optional: true })) libraryId?: number,
  ): Promise<BookResponseDto[]> {
    return this.bookService.findAll(user.id, libraryId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search books' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({
    name: 'libraryId',
    required: false,
    type: Number,
    description: 'Filter by library ID',
  })
  @ApiResponse({ status: 200, description: 'Books found successfully', type: [BookResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(
    @CurrentUser() user: User,
    @Query('q') query: string,
    @Query('libraryId', new ParseIntPipe({ optional: true })) libraryId?: number,
  ): Promise<BookResponseDto[]> {
    return this.bookService.searchBooks(user.id, query, libraryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get book by ID' })
  @ApiResponse({ status: 200, description: 'Book retrieved successfully', type: BookResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<BookResponseDto> {
    return this.bookService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update book' })
  @ApiResponse({ status: 200, description: 'Book updated successfully', type: BookResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() updateBookDto: UpdateBookDto,
  ): Promise<BookResponseDto> {
    return this.bookService.update(id, user.id, updateBookDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete book' })
  @ApiResponse({ status: 200, description: 'Book deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.bookService.remove(id, user.id);
    return { message: 'Book deleted successfully' };
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move book to shelf' })
  @ApiResponse({ status: 200, description: 'Book moved successfully', type: BookResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Book or shelf not found' })
  async moveToShelf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body('shelfId') shelfId: number | null,
  ): Promise<BookResponseDto> {
    return this.bookService.moveToShelf(id, shelfId, user.id);
  }
}
