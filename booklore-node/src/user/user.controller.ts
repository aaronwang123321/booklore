import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UserUpdateDto } from './dto/user-update.dto';
import { ChangePasswordDto, ChangeUserPasswordDto } from './dto/change-password.dto';
import { UpdateUserSettingDto } from './dto/user-setting.dto';
import { UserResponseDto, UserListResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getCurrentUser(@CurrentUser('id') userId: number): Promise<UserResponseDto> {
    return this.userService.getCurrentUser(userId);
  }

  @Get(':id')
  async getUserById(
    @Param('id', ParseIntPipe) userId: number,
    @CurrentUser('id') requesterId: number,
  ): Promise<UserResponseDto> {
    return this.userService.getUserById(userId, requesterId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAllUsers(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ): Promise<UserListResponseDto> {
    return this.userService.getAllUsers(page, limit);
  }

  @Put(':id')
  async updateUser(
    @Param('id', ParseIntPipe) userId: number,
    @Body() updateData: UserUpdateDto,
    @CurrentUser('id') requesterId: number,
  ): Promise<UserResponseDto> {
    return this.userService.updateUser(userId, updateData, requesterId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id', ParseIntPipe) userId: number,
    @CurrentUser('id') requesterId: number,
  ): Promise<void> {
    return this.userService.deleteUser(userId, requesterId);
  }

  @Put('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser('id') userId: number,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    return this.userService.changePassword(userId, changePasswordDto);
  }

  @Put(':id/password')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeUserPassword(
    @Param('id', ParseIntPipe) userId: number,
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
    @CurrentUser('id') requesterId: number,
  ): Promise<void> {
    return this.userService.changeUserPassword(userId, changeUserPasswordDto, requesterId);
  }

  @Put('me/settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUserSetting(
    @CurrentUser('id') userId: number,
    @Body() updateUserSettingDto: UpdateUserSettingDto,
  ): Promise<void> {
    return this.userService.updateUserSetting(userId, updateUserSettingDto);
  }
}
