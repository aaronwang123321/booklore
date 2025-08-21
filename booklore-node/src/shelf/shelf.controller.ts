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
import { ShelfService } from './shelf.service';
import {
  CreateShelfDto,
  UpdateShelfDto,
  ShelfResponseDto,
  AddBooksToShelfDto,
  RemoveBooksFromShelfDto,
} from './dto/shelf.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('shelves')
@Controller('shelves')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShelfController {
  constructor(private readonly shelfService: ShelfService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new shelf' })
  @ApiResponse({
    status: 201,
    description: 'Shelf created successfully',
    type: ShelfResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async create(
    @CurrentUser() user: User,
    @Body() createShelfDto: CreateShelfDto,
  ): Promise<ShelfResponseDto> {
    return this.shelfService.create(user.id, createShelfDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accessible shelves' })
  @ApiResponse({
    status: 200,
    description: 'Shelves retrieved successfully',
    type: [ShelfResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: User,
    @Query('libraryId', ParseIntPipe) libraryId?: number,
  ): Promise<ShelfResponseDto[]> {
    return this.shelfService.findAll(user.id, libraryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shelf by ID' })
  @ApiResponse({
    status: 200,
    description: 'Shelf retrieved successfully',
    type: ShelfResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ShelfResponseDto> {
    return this.shelfService.findOne(id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update shelf' })
  @ApiResponse({
    status: 200,
    description: 'Shelf updated successfully',
    type: ShelfResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() updateShelfDto: UpdateShelfDto,
  ): Promise<ShelfResponseDto> {
    return this.shelfService.update(id, user.id, updateShelfDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete shelf' })
  @ApiResponse({ status: 200, description: 'Shelf deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.shelfService.remove(id, user.id);
    return { message: 'Shelf deleted successfully' };
  }

  @Get(':id/books')
  @ApiOperation({ summary: 'Get all books in a shelf' })
  @ApiResponse({ status: 200, description: 'Books retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async getBooks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.shelfService.getShelfBooks(id, user.id);
  }

  @Post(':id/books')
  @ApiOperation({ summary: 'Add books to shelf' })
  @ApiResponse({ status: 200, description: 'Books added to shelf successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async addBooks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() addBooksDto: AddBooksToShelfDto,
  ): Promise<{ message: string; addedCount: number }> {
    const result = await this.shelfService.addBooksToShelf(id, user.id, addBooksDto.bookIds);
    return {
      message: 'Books added to shelf successfully',
      addedCount: result.addedCount,
    };
  }

  @Delete(':id/books')
  @ApiOperation({ summary: 'Remove books from shelf' })
  @ApiResponse({ status: 200, description: 'Books removed from shelf successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async removeBooks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() removeBooksDto: RemoveBooksFromShelfDto,
  ): Promise<{ message: string; removedCount: number }> {
    const result = await this.shelfService.removeBooksFromShelf(
      id,
      user.id,
      removeBooksDto.bookIds,
    );
    return {
      message: 'Books removed from shelf successfully',
      removedCount: result.removedCount,
    };
  }

  @Post(':id/reorder')
  @ApiOperation({ summary: 'Reorder shelf position' })
  @ApiResponse({ status: 200, description: 'Shelf reordered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Shelf not found' })
  async reorder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() body: { newOrder: number },
  ): Promise<{ message: string }> {
    await this.shelfService.reorderShelf(id, user.id, body.newOrder);
    return { message: 'Shelf reordered successfully' };
  }
}
