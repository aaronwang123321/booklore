import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthorService } from './author.service';
import { CreateAuthorDto, UpdateAuthorDto, AddAuthorToBookDto } from './dto/author.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('authors')
@Controller('authors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuthorController {
  constructor(private readonly authorService: AuthorService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new author' })
  @ApiResponse({ status: 201, description: 'Author created successfully' })
  async create_author(@Body() createAuthorDto: CreateAuthorDto) {
    return this.authorService.create_author(createAuthorDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all authors' })
  @ApiResponse({ status: 200, description: 'List of all authors' })
  async find_all_authors() {
    return this.authorService.find_all_authors();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search authors' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search_authors(@Query('q') query: string) {
    return this.authorService.search_authors(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get author by ID' })
  @ApiResponse({ status: 200, description: 'Author details' })
  @ApiResponse({ status: 404, description: 'Author not found' })
  async find_author_by_id(@Param('id', ParseIntPipe) id: number) {
    return this.authorService.find_author_by_id(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update author' })
  @ApiResponse({ status: 200, description: 'Author updated successfully' })
  @ApiResponse({ status: 404, description: 'Author not found' })
  async update_author(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAuthorDto: UpdateAuthorDto,
  ) {
    return this.authorService.update_author(id, updateAuthorDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete author' })
  @ApiResponse({ status: 204, description: 'Author deleted successfully' })
  @ApiResponse({ status: 404, description: 'Author not found' })
  async delete_author(@Param('id', ParseIntPipe) id: number) {
    await this.authorService.delete_author(id);
  }

  @Get('book/:bookId')
  @ApiOperation({ summary: 'Get authors by book ID' })
  @ApiResponse({ status: 200, description: 'List of authors for the book' })
  async get_authors_by_book_id(@Param('bookId', ParseIntPipe) bookId: number) {
    return this.authorService.get_authors_by_book_id(bookId);
  }

  @Post('book/:bookId/authors')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add author to book' })
  @ApiResponse({ status: 201, description: 'Author added to book successfully' })
  async add_author_to_book(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() addAuthorDto: AddAuthorToBookDto,
  ) {
    return this.authorService.add_author_to_book(
      bookId,
      addAuthorDto.authorId,
      addAuthorDto.role || 'author',
    );
  }

  @Delete('book/:bookId/authors/:authorId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove author from book' })
  @ApiResponse({ status: 204, description: 'Author removed from book successfully' })
  async remove_author_from_book(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('authorId', ParseIntPipe) authorId: number,
  ) {
    await this.authorService.remove_author_from_book(bookId, authorId);
  }
}
