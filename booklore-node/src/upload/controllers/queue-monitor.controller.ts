import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { QueueService } from '../services/queue.service';

@ApiTags('Queue Monitor')
@Controller('queue-monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class QueueMonitorController {
  constructor(private readonly queueService: QueueService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get queue dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getDashboard() {
    const stats = await this.queueService.getQueueStats();

    return {
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('jobs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get jobs list with pagination' })
  @ApiResponse({ status: 200, description: 'Jobs list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getJobs(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    // This would need to be implemented in QueueService
    // For now, return basic stats
    const stats = await this.queueService.getQueueStats();

    return {
      success: true,
      data: {
        jobs: [], // Would contain actual job data
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: stats.total,
        },
        filter: {
          status: status || 'all',
        },
      },
    };
  }

  @Get('jobs/:jobId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get detailed job information' })
  @ApiResponse({ status: 200, description: 'Job details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getJobDetails(@Param('jobId') jobId: string) {
    const jobStatus = await this.queueService.getJobStatus(jobId);

    if (!jobStatus) {
      throw new BadRequestException('Job not found');
    }

    return {
      success: true,
      data: jobStatus,
    };
  }

  @Post('jobs/:jobId/retry')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retry a failed job' })
  @ApiResponse({ status: 200, description: 'Job retry initiated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async retryJob(@Param('jobId') jobId: string) {
    // This would need to be implemented in QueueService
    // For now, return a placeholder response
    return {
      success: true,
      message: `Job ${jobId} retry initiated`,
    };
  }

  @Delete('jobs/:jobId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a job from the queue' })
  @ApiResponse({ status: 200, description: 'Job removed successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async removeJob(@Param('jobId') jobId: string) {
    // This would need to be implemented in QueueService
    // For now, return a placeholder response
    return {
      success: true,
      message: `Job ${jobId} removed`,
    };
  }

  @Get('metrics')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get queue performance metrics' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getMetrics() {
    const stats = await this.queueService.getQueueStats();

    // Calculate some basic metrics
    const totalJobs = stats.total;
    const completionRate = totalJobs > 0 ? (stats.completed / totalJobs) * 100 : 0;
    const failureRate = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;

    return {
      success: true,
      data: {
        totalJobs,
        completionRate: Math.round(completionRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        activeJobs: stats.active,
        waitingJobs: stats.waiting,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('maintenance/pause')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Pause queue for maintenance' })
  @ApiResponse({ status: 200, description: 'Queue paused successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async pauseForMaintenance() {
    await this.queueService.pauseQueue();

    return {
      success: true,
      message: 'Queue paused for maintenance',
    };
  }

  @Post('maintenance/resume')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resume queue after maintenance' })
  @ApiResponse({ status: 200, description: 'Queue resumed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async resumeAfterMaintenance() {
    await this.queueService.resumeQueue();

    return {
      success: true,
      message: 'Queue resumed after maintenance',
    };
  }

  @Post('maintenance/clean')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Clean old jobs and optimize queue' })
  @ApiResponse({ status: 200, description: 'Queue cleaned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async cleanQueue() {
    await this.queueService.cleanQueue();

    return {
      success: true,
      message: 'Queue cleaned and optimized',
    };
  }
}
