import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OpdsAuthService } from '../services/opds-auth.service';
import { CreateOpdsUserDto, UpdateOpdsUserDto } from '../dto/opds.dto';

@Controller('opds-users')
@UseGuards(JwtAuthGuard)
export class OpdsAdminController {
  constructor(private opdsAuthService: OpdsAuthService) {}

  /**
   * Get current user's OPDS account
   */
  @Get()
  async getOpdsUser(@Request() req: any) {
    const userId = req.user.id;
    return await this.opdsAuthService.getOpdsUser(userId);
  }

  /**
   * Create OPDS account for current user
   */
  @Post()
  async createOpdsUser(@Request() req: any, @Body() createOpdsUserDto: CreateOpdsUserDto) {
    const userId = req.user.id;
    return await this.opdsAuthService.createOpdsUser(userId, createOpdsUserDto);
  }

  /**
   * Update current user's OPDS account
   */
  @Put(':userId/reset-password')
  async updateOpdsUser(@Request() req: any, @Body() updateOpdsUserDto: UpdateOpdsUserDto) {
    const userId = req.user.id;
    return await this.opdsAuthService.updateOpdsUser(userId, updateOpdsUserDto);
  }

  /**
   * Delete current user's OPDS account
   */
  @Delete(':userId')
  async deleteOpdsUser(@Request() req: any) {
    const userId = req.user.id;
    await this.opdsAuthService.deleteOpdsUser(userId);
    return { message: 'OPDS account deleted successfully' };
  }
}
