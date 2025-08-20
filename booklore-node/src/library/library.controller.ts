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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LibraryService } from './library.service';
import { CreateLibraryDto, UpdateLibraryDto, LibraryResponseDto } from './dto/library.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Libraries')
@Controller('libraries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new library' })
  @ApiResponse({
    status: 201,
    description: 'Library created successfully',
    type: LibraryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: User,
    @Body() createLibraryDto: CreateLibraryDto,
  ): Promise<LibraryResponseDto> {
    return this.libraryService.create(user.id, createLibraryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accessible libraries' })
  @ApiResponse({
    status: 200,
    description: 'Libraries retrieved successfully',
    type: [LibraryResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: User): Promise<LibraryResponseDto[]> {
    return this.libraryService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get library by ID' })
  @ApiResponse({
    status: 200,
    description: 'Library retrieved successfully',
    type: LibraryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Library not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<LibraryResponseDto> {
    return this.libraryService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update library' })
  @ApiResponse({
    status: 200,
    description: 'Library updated successfully',
    type: LibraryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Library not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() updateLibraryDto: UpdateLibraryDto,
  ): Promise<LibraryResponseDto> {
    return this.libraryService.update(id, user.id, updateLibraryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete library' })
  @ApiResponse({ status: 200, description: 'Library deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Library not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.libraryService.remove(id, user.id);
    return { message: 'Library deleted successfully' };
  }

  @Get(':id/books')
  @ApiOperation({ summary: 'Get all books in a library' })
  @ApiResponse({ status: 200, description: 'Books retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Library not found' })
  async getBooks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.libraryService.getLibraryBooks(id, user.id);
  }

  @Get(':id/shelves')
  @ApiOperation({ summary: 'Get all shelves in a library' })
  @ApiResponse({ status: 200, description: 'Shelves retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Library not found' })
  async getShelves(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.libraryService.getLibraryShelves(id, user.id);
  }
}
