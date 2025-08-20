import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SetupService } from '../setup/setup.service';
import { SetupStatusDto, FirstUserDto, SetupResponseDto } from './dto/setup.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Setup')
@Controller('setup')
@Public()
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get setup status',
    description: 'Check if the application has been set up (first admin user created)',
  })
  @ApiResponse({
    status: 200,
    description: 'Setup status retrieved successfully',
    type: SetupStatusDto,
  })
  async getSetupStatus(): Promise<SetupStatusDto> {
    return this.setupService.getSetupStatus();
  }

  @Post('first-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create first admin user',
    description: 'Create the first admin user to complete application setup',
  })
  @ApiResponse({
    status: 201,
    description: 'First admin user created successfully',
    type: SetupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Setup already completed or invalid data',
  })
  @ApiResponse({
    status: 409,
    description: 'Admin user already exists',
  })
  async createFirstUser(@Body() firstUserDto: FirstUserDto): Promise<SetupResponseDto> {
    return this.setupService.createFirstUser(firstUserDto);
  }
}
