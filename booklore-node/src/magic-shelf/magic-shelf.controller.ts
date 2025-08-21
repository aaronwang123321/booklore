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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MagicShelfService } from './magic-shelf.service';
import {
  CreateMagicShelfDto,
  UpdateMagicShelfDto,
  SmartRecommendationDto,
} from './dto/magic-shelf.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('magic-shelves')
@Controller('magic-shelves')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MagicShelfController {
  constructor(private readonly magicShelfService: MagicShelfService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new magic shelf' })
  @ApiResponse({ status: 201, description: 'Magic shelf created successfully' })
  async create_magic_shelf(@Request() req: any, @Body() createMagicShelfDto: CreateMagicShelfDto) {
    return this.magicShelfService.create_magic_shelf(req.user.id, createMagicShelfDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all magic shelves for current user' })
  @ApiResponse({ status: 200, description: 'List of user magic shelves' })
  async find_all_magic_shelves(@Request() req: any) {
    return this.magicShelfService.find_all_magic_shelves_by_user(req.user.id);
  }

  @Get('library/:libraryId')
  @ApiOperation({ summary: 'Get magic shelves by library ID' })
  @ApiResponse({ status: 200, description: 'List of magic shelves for the library' })
  async find_magic_shelves_by_library(@Param('libraryId', ParseIntPipe) libraryId: number) {
    return this.magicShelfService.find_magic_shelves_by_library(libraryId);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Generate smart recommendations' })
  @ApiResponse({ status: 200, description: 'Smart book recommendations' })
  async generate_smart_recommendations(
    @Request() req: any,
    @Query() smartRecommendationDto: SmartRecommendationDto,
  ) {
    return this.magicShelfService.generate_smart_recommendations(
      req.user.id,
      smartRecommendationDto.libraryId,
    );
  }

  @Post('smart-shelf')
  @ApiOperation({ summary: 'Create smart shelf from recommendations' })
  @ApiResponse({ status: 201, description: 'Smart shelf created successfully' })
  async create_smart_shelf_from_recommendations(
    @Request() req: any,
    @Body() smartRecommendationDto: SmartRecommendationDto,
  ) {
    return this.magicShelfService.create_smart_shelf_from_recommendations(
      req.user.id,
      smartRecommendationDto.libraryId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get magic shelf by ID' })
  @ApiResponse({ status: 200, description: 'Magic shelf details' })
  @ApiResponse({ status: 404, description: 'Magic shelf not found' })
  async find_magic_shelf_by_id(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.magicShelfService.find_magic_shelf_by_id(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update magic shelf' })
  @ApiResponse({ status: 200, description: 'Magic shelf updated successfully' })
  @ApiResponse({ status: 404, description: 'Magic shelf not found' })
  async update_magic_shelf(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() updateMagicShelfDto: UpdateMagicShelfDto,
  ) {
    return this.magicShelfService.update_magic_shelf(id, req.user.id, updateMagicShelfDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete magic shelf' })
  @ApiResponse({ status: 204, description: 'Magic shelf deleted successfully' })
  @ApiResponse({ status: 404, description: 'Magic shelf not found' })
  async delete_magic_shelf(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.magicShelfService.delete_magic_shelf(id, req.user.id);
  }
}
