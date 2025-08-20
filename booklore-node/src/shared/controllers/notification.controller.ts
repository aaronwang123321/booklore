import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  NotificationService,
  NotificationType,
  NotificationPreferences,
} from '../services/notification.service';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取用户通知列表' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量，默认20' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '偏移量，默认0' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: '仅显示未读通知' })
  @ApiQuery({
    name: 'types',
    required: false,
    type: String,
    description: '通知类型过滤，多个用逗号分隔',
  })
  @ApiResponse({ status: 200, description: '通知列表获取成功' })
  async getNotifications(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('unreadOnly') unreadOnly?: boolean,
    @Query('types') types?: string,
  ) {
    const userId = req.user.id;
    const typeArray = types ? (types.split(',') as NotificationType[]) : undefined;

    return this.notificationService.getUserNotifications(userId, {
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
      unreadOnly: unreadOnly === true || String(unreadOnly) === 'true',
      types: typeArray,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  @ApiQuery({
    name: 'types',
    required: false,
    type: String,
    description: '通知类型过滤，多个用逗号分隔',
  })
  @ApiResponse({ status: 200, description: '未读通知数量' })
  async getUnreadCount(@Request() req, @Query('types') types?: string) {
    const userId = req.user.id;
    const typeArray = types ? (types.split(',') as NotificationType[]) : undefined;

    const count = await this.notificationService.getUnreadCount(userId, typeArray);
    return { count };
  }

  @Put(':id/read')
  @ApiOperation({ summary: '标记通知为已读' })
  @ApiParam({ name: 'id', description: '通知ID' })
  @ApiResponse({ status: 200, description: '标记成功' })
  async markAsRead(@Request() req, @Param('id') notificationId: string) {
    const userId = req.user.id;
    await this.notificationService.markAsRead(notificationId, userId);
    return { success: true };
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: '标记所有通知为已读' })
  @ApiQuery({
    name: 'types',
    required: false,
    type: String,
    description: '通知类型过滤，多个用逗号分隔',
  })
  @ApiResponse({ status: 200, description: '标记成功' })
  async markAllAsRead(@Request() req, @Query('types') types?: string) {
    const userId = req.user.id;
    const typeArray = types ? (types.split(',') as NotificationType[]) : undefined;

    const count = await this.notificationService.markAllAsRead(userId, typeArray);
    return { success: true, markedCount: count };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知' })
  @ApiParam({ name: 'id', description: '通知ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteNotification(@Request() req, @Param('id') notificationId: string) {
    const userId = req.user.id;
    await this.notificationService.deleteNotification(notificationId, userId);
    return { success: true };
  }

  @Get('preferences')
  @ApiOperation({ summary: '获取通知偏好设置' })
  @ApiResponse({ status: 200, description: '通知偏好设置' })
  async getPreferences(@Request() req) {
    const userId = req.user.id;
    return this.notificationService.getUserPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({ summary: '更新通知偏好设置' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updatePreferences(@Request() req, @Body() preferences: Partial<NotificationPreferences>) {
    const userId = req.user.id;
    const updated = await this.notificationService.updateUserPreferences(userId, preferences);
    return { success: true, preferences: updated };
  }

  @Post('test')
  @ApiOperation({ summary: '发送测试通知（开发用）' })
  @ApiResponse({ status: 200, description: '测试通知发送成功' })
  async sendTestNotification(@Request() req) {
    const userId = req.user.id;

    const notification = await this.notificationService.createNotification({
      userId,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: '测试通知',
      message: '这是一条测试通知，用于验证通知系统是否正常工作。',
      actionUrl: '/dashboard',
      actionText: '查看详情',
    });

    return { success: true, notification };
  }
}
